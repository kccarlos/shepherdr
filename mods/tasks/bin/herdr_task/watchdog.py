"""Watchdog: restarts a live Assistant that is stuck, or alerts the person (FAC-62)."""

import hashlib
import json
import os
import subprocess

from . import news
from .base import APP_HOME, Fail, guard, hc_json, now, PACKAGE, run, STORE
from .settings import bare
from .agents import agent_running, detail, held_ask, live_agents, STARTING_MS, status_word, task_status
from .commands import send_alert
from .news import QUIET_MS, stall_of, typing
from .store import read_list, store_files

STUCK_MS = 30 * 60000              # Needs you / Failed / Stalled, or "working" with an unchanged screen
RESTART_COOLDOWN_MS = 2 * 3600000  # stuck again within 2 hours of a restart: alert instead of restarting
NEWS_GRACE_MS = STARTING_MS        # time after news lands for the Assistant to start its turn
WATCHDOG = os.path.join(STORE, ".watchdog.json")


def restart_assistant(k):
    """Restarts Assistant `k` with coordinator/restart.sh (HERDR_RESTART_CHAT when chat-backed)."""
    guard(["hc"])
    repo = os.path.normpath(os.path.join(PACKAGE, "..", "..", "..", "coordinator", "restart.sh"))
    inst = os.path.join(APP_HOME, "mods", "coordinator", "restart.sh")
    script = inst if os.path.isfile(inst) else repo if os.path.isfile(repo) else inst
    env = {x: v for x, v in os.environ.items() if x != "HC_TERMINAL_ID"}
    if (k.get("labels") or {}).get("herdr.chat"):
        env["HERDR_RESTART_CHAT"] = k["labels"]["herdr.chat"]
    r = subprocess.run(["bash", script, k["address"]], env=env, stdin=subprocess.DEVNULL,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=120)
    nxt = ((r.stdout or "").strip().splitlines() or [""])[-1].strip()
    return nxt if r.returncode == 0 and nxt else None


def _condition(slug, prefix, t, tasks, lists):
    if t.get("state") not in ("running", "ready"):
        return None
    ref, live = f"{prefix}-{t['id']}", [w for w in map(detail, live_agents(f"{slug}#{t['id']}")) if agent_running(w)]
    status, needs, why = task_status(t, live)
    if status == "needs":
        failed = needs in ("stopped", "provider") or str(why or "").startswith("Couldn't start")
        return ("failed" if failed else "needs-you"), STUCK_MS, f"{ref} {'failed' if failed else 'in Needs you'}", None, live
    if status == "working":
        stall = stall_of(t, {"status": status}, live)
        return ("stalled", STUCK_MS, f"{ref} stalled", stall[0], live) if stall else None
    waiting = lambda x: x.get("state") in ("queued", "todo") and not x.get("archived")
    if status == "ready" and (any(waiting(x) and t["id"] in (x.get("after") or []) for x in tasks) or any(
            waiting(x) and any(not e.get("machine") and e.get("prefix") == prefix and e.get("id") == t["id"] for e in (x.get("after_ext") or []))
            for _, _, other in lists for x in other)):
        return "ready", NEWS_GRACE_MS, f"{ref} Ready with tasks waiting behind it", None, live
    return None


def _task_since(t, kind, stall_mark, live):
    if kind == "ready":
        return t.get("ready_at")
    if kind == "stalled" and stall_mark and stall_mark.partition(":")[2].isdigit():
        tag, _, raw = stall_mark.partition(":")
        eta = ((t.get("progress") or {}).get("left") or 0) // 60000
        return int(raw) + (QUIET_MS if tag == "quiet" else (eta + max(eta, 20)) * 60000)
    ts = [x for x in (t.get("attention_at"), (t.get("progress") or {}).get("paused_at")) if x] or (
        [w.get("status_ms") for w in live if w.get("status_ms")] if live else
        [a.get("ended") or a.get("at") for a in (t.get("agents") or []) if a.get("ended") or a.get("at")])
    return max(ts) if ts and kind in ("needs-you", "failed") else None


def _stuck_task(space, addr, k, rec, lists, news_data, live_addrs):
    outbox, delivered = news_data.get("outbox") or [], news_data.get("delivered") or {}
    cur_turn, st_ms = k.get("turn") or 0, k.get("status_ms") or 0
    restarted = rec.get("restarted_at") if rec.get("restarted_to") == addr else None
    for slug, prefix, tasks in lists:
        for t in tasks:
            key = f"{slug}#{t['id']}"
            cond = (None if t.get("archived") or bare(t.get("space") or "") != space
                    or any(x.get("key") == key for x in outbox) else _condition(slug, prefix, t, tasks, lists))
            if not cond:
                continue
            kind, min_age, desc, stall_mark, live = cond
            task_ts, d = _task_since(t, kind, stall_mark, live), delivered.get(key)
            matched = isinstance(d, dict) and d.get("event") == kind and (kind != "stalled" or d.get("stall") == stall_mark)
            if matched and d.get("to") == addr:
                cond_since = min(task_ts, d["at"]) if task_ts and st_ms <= task_ts else d["at"]
                reached_at, had_turn = d["at"], cur_turn > (d.get("turn") or 0) or st_ms > d["at"]
            elif matched and d.get("to") not in live_addrs:
                cond_since = reached_at = restarted or max(k.get("created_ms") or 0, d["at"])
                had_turn = cur_turn > 0 or st_ms > reached_at
            elif not matched and task_ts is not None:
                cond_since = reached_at = restarted if restarted and task_ts <= restarted else task_ts
                had_turn = (cur_turn > 0) if restarted and task_ts <= restarted else (cur_turn > 0 and st_ms > task_ts)
            else:
                continue
            if not had_turn and now() - cond_since >= min_age and now() - reached_at >= NEWS_GRACE_MS:
                return desc if kind == "ready" else f"{desc} for {(now() - cond_since) // 60000} min"
    return None


def _wake_inflight(ap_spaces, space, addr, k, turn_max_ms):
    for sp, a in (ap_spaces or {}).items():
        f = (a or {}).get("inflight")
        if isinstance(f, dict) and (sp == space or f.get("to") == addr) and (not f.get("to") or f["to"] == addr):
            if now() - (f.get("at") or 0) <= turn_max_ms and (
                    status_word(k) == "working" or ((k.get("turn") or 0) <= (f.get("turn") or 0) and (k.get("status_ms") or 0) <= (f.get("at") or 0))):
                return True
    return False


def watchdog_pass(report):
    """Restarts a stuck local Assistant once with a handoff; stuck again within 2 hours, alerts once."""
    from . import autopilot as ap
    prev_all = read_list(WATCHDOG)
    prev_all = prev_all if isinstance(prev_all, dict) else {}
    news_data, held_data = read_list(news.NEWS) or {}, read_list(news.HELD) or {}
    ap_spaces = ((read_list(ap.STATE) or {}).get("spaces")) or {}
    retries = read_list(os.path.join(STORE, ".retries.json")) or {}
    lists = [(os.path.basename(p)[:-5], d.get("prefix") or "TASK", d.get("tasks") or [])
             for p in store_files() for d in [read_list(p)] if isinstance(d, dict)]
    coords = [k for k in (hc_json("ls", "--label", "herdr.role=coordinator") or {}).get("terminals", [])
              if k.get("state") == "live" and "/" not in (k.get("address") or "/")]
    live_addrs = {k["address"] for k in coords}
    state = {s: dict(r) for s, r in prev_all.items()
             if isinstance(r, dict) and r.get("restarted_at") and now() - r["restarted_at"] < RESTART_COOLDOWN_MS}

    for item in coords:
        addr = item["address"]
        k = None if held_ask(addr) else (hc_json("get", addr) or item)
        if not k or k.get("state") != "live" or "/" in (k.get("address") or "/") or ((k.get("foreground") or k.get("agent")) and not agent_running(k)):
            continue
        labels = dict(k.get("labels") or {}, **{"herdr.role": "coordinator"})
        k["labels"] = labels
        space = bare(labels.get("herdr.space") or labels.get("herdr.coordinator.space") or "")
        slot = space or labels.get("herdr.chat") or labels.get("herdr.coordinator.tab") or labels.get("herdr.tab") or next(
            (s for s, r in prev_all.items() if isinstance(r, dict) and r.get("restarted_to") == addr), addr)
        rec = dict(state.get(slot) or prev_all.get(slot) or {}, address=addr)
        if rec.get("alerted") and (rec["alerted"].get("address") != addr or (k.get("turn") or 0) > (rec["alerted"].get("turn") or 0)):
            rec.pop("alerted", None)

        st, why = status_word(k), None
        if st == "working":
            r = run(["hc", "read", addr, "--lines", "80"])
            if r.returncode == 0:
                digest = hashlib.sha1((r.stdout or "").encode("utf-8", "replace")).hexdigest()[:16]
                prev = prev_all.get(slot) or {}
                since = prev["screen_since"] if prev.get("address") == addr and prev.get("screen") == digest and prev.get("screen_since") else now()
                rec["screen"], rec["screen_since"] = digest, since
                if now() - since >= STUCK_MS:
                    why = f"working with an unchanged screen for {(now() - since) // 60000} min"
        else:
            rec.pop("screen", None)
            rec.pop("screen_since", None)
            booting = not k.get("turn") and k.get("created_ms") and now() - k["created_ms"] < STARTING_MS
            if st in ("idle", "done", None) and space and not booting and not held_data.get(addr) and not (retries.get(addr) or {}).get("due"):
                why = _stuck_task(space, addr, k, rec, lists, news_data, live_addrs)

        if why and not _wake_inflight(ap_spaces, space, addr, k, ap.TURN_MAX_MS) and not typing(addr, k):
            if rec.get("restarted_at") and now() - rec["restarted_at"] < RESTART_COOLDOWN_MS:
                if not rec.get("alerted"):
                    sp_name = (ap_spaces.get(space) or {}).get("name") if space else None
                    who = sp_name if sp_name and sp_name != "~" else (space or os.path.basename((k.get("cwd") or "").rstrip("/")) or addr)
                    title = f"{who}'s Assistant is stuck: {why}"
                    try:
                        send_alert(addr, title, body=why, about=True)
                        rec["alerted"] = {"address": addr, "turn": k.get("turn") or 0, "at": now()}
                        report.setdefault("watchdog", []).append({"action": "alerted", "address": addr, "space": space, "title": title})
                    except Fail:
                        pass
            elif nxt := restart_assistant(k):
                if slot == addr:
                    state.pop(slot, None)
                    slot = nxt
                rec = {"address": nxt, "restarted_at": now(), "restarted_to": nxt}
                report.setdefault("watchdog", []).append({"action": "restarted", "from": addr, "to": nxt, "space": space, "why": why})
        state[slot] = rec

    if state != prev_all:
        os.makedirs(os.path.dirname(WATCHDOG), exist_ok=True)
        tmp = f"{WATCHDOG}.{os.getpid()}.tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, WATCHDOG)
