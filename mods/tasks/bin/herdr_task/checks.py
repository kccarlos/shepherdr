"""The merge gate's checks (docs/factory.md section 6): for a Ready task in a gate folder (review.min > 0)
with tasks.check set, herdr-task runs the check itself on the task's exact head, in a throwaway
detached worktree, and records the real result (contracts/gate-evidence.md, t["checks"])."""

import json
import shutil
import tempfile

from .base import git, hc_json, now, run
from .github import gh
from .settings import settings_for, settings_layers

LIMIT_MS = 20 * 60000
TAIL = 4000


def gate_on(s, t):
    """review.min > 0 for this task's folder (0 while the setting doesn't exist)."""
    n = 0
    for layer in settings_layers(s, t.get("space")):
        n = (layer.get("review") or {}).get("min", n)
    return isinstance(n, int) and n > 0


def ci_of(t, sha):
    """GitHub's state for sha on the task's pull request: {state, url}, or None without one."""
    pr = t.get("pr")
    if not pr:
        return None
    ok, out, _ = gh("api", f"repos/{pr['repo']}/commits/{sha}/check-runs")
    try:
        runs = json.loads(out)["check_runs"] if ok else None
    except (ValueError, KeyError):
        runs = None
    if runs is None:
        return {"state": "pending", "url": pr.get("url")}
    state = "none"
    if runs:
        done = [r.get("conclusion") for r in runs if r.get("status") == "completed"]
        state = "pending" if len(done) < len(runs) else \
            "failure" if any(c not in ("success", "neutral", "skipped") for c in done) else "success"
    return {"state": state, "url": pr.get("url")}


def drop(t, wt, c):
    git(wt, "worktree", "remove", "--force", c["tmp"])
    shutil.rmtree(c["tmp"], ignore_errors=True)
    run(["hc", "rm", c["address"]])
    t.pop("check_run", None)


def checks_pass(s, t):
    """One tick's step for one task: record a finished check run, or start one at a head without a record."""
    wt = t.get("worktree")
    if t["state"] != "ready" or not wt or not gate_on(s, t):
        return
    c = t.get("check_run")
    if c:
        k = hc_json("get", c["address"]) or {}
        over = k.get("state") == "live" and now() - c["started_at"] > LIMIT_MS
        if k.get("state") == "live" and not over:
            return
        if over:
            run(["hc", "kill", c["address"]])
        tail = run(["hc", "read", c["address"], "--lines", "200"]).stdout.rstrip()
        code = k.get("exit_code")
        t.setdefault("checks", []).append({
            "sha": c["sha"], "command": c["command"], "exit": 124 if over else code if isinstance(code, int) else 1,
            "output_tail": ((f"Killed: ran longer than {LIMIT_MS // 60000} minutes.\n" if over else "") + tail)[-TAIL:],
            "started_at": c["started_at"], "finished_at": now(), "by": c["address"], "ci": ci_of(t, c["sha"])})
        drop(t, wt, c)
        s.dirty = True
        return
    cmd = settings_for(s, t.get("space"))["tasks"].get("check")
    ok, sha, _ = git(wt, "rev-parse", "HEAD")
    if not cmd or not ok or any(r["sha"] == sha for r in t.get("checks") or []):
        return
    tmp = tempfile.mkdtemp(prefix="herdr-check-")
    if not git(wt, "worktree", "add", "--detach", tmp, sha)[0]:
        shutil.rmtree(tmp, ignore_errors=True)
        return
    try:
        r = run(["hc", "run", "--bg", "--json", "--keep", "--outlive-parent", "--no-notify", "--cwd", tmp,
                 "--label", "herdr.role=checks", "--label", f"herdr.task={s.key(t)}", "--", "sh", "-c", cmd])
        address = json.loads(r.stdout)["address"] if r.returncode == 0 else None
    except (ValueError, KeyError):
        address = None
    except BaseException:
        git(wt, "worktree", "remove", "--force", tmp)
        raise
    if not address:
        git(wt, "worktree", "remove", "--force", tmp)
        return
    t["check_run"] = {"sha": sha, "command": cmd, "address": address, "tmp": tmp, "started_at": now()}
    s.dirty = True


def checks_line(t):
    """The task's view: where its checks stand, in a few words ("" when they don't apply)."""
    if t.get("check_run"):
        return "checks: running on " + t["check_run"]["sha"][:8]
    c = (t.get("checks") or [None])[-1]
    if not c:
        return ""
    ci = (c.get("ci") or {}).get("state")
    return f"checks: {'passed' if c['exit'] == 0 else 'failed (exit %d)' % c['exit']} on {c['sha'][:8]}" + (f", CI {ci}" if ci else "")
