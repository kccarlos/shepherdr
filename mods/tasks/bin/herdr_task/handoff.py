"""At the floor (docs/factory.md section 7): the handoff of each running task whose worker is on a
usage pool that reached its floor, written from git and its chat by takeover's handover(), and kept
in a file per task under the store's folder. Only the writer: interrupting, the tick and a command
come with the gate (G4)."""

import os

from . import base
from .agents import agent_log
from .takeover import handover


def model_of(argv):
    """The --model (or codex's -m) an agent was started with, else None."""
    argv = [str(x) for x in argv or []]
    for i, a in enumerate(argv):
        if a in ("--model", "-m") and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith("--model="):
            return a.split("=", 1)[1]
    return None


def pool_of(agent):
    """The usage pool an agent record ({agent, argv}) spends, named as usage.py (FAC-20) names them:
    claude, codex, antigravity-gemini or antigravity-claude-gpt. None when it can't be told (agy on
    its own default model). Defined here until FAC-20 merges."""
    kind = (agent or {}).get("agent")
    if kind in ("claude", "codex"):
        return kind
    if kind == "agy":
        model = (model_of(agent.get("argv")) or "").lower()
        if model.startswith("gemini"):
            return "antigravity-gemini"
        if model.startswith(("claude", "gpt")):
            return "antigravity-claude-gpt"
    return None


def handoffs(s, pool, tasks):
    """[{task, text, path}] for each running task in `tasks` whose worker (its newest agent) is on
    `pool`: the handover text, saved to <store>/handoffs/<slug>-<id>.md."""
    out = []
    for t in tasks:
        a = (t.get("agents") or [None])[-1]
        if t.get("state") != "running" or not a or pool_of(a) != pool:
            continue
        text = handover(s, t, a["agent"], a["agent"], f"the {pool} pool reached its floor", agent_log(t, a.get("address")))
        folder = os.path.join(base.STORE, "handoffs")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, s.key(t).replace("#", "-") + ".md")
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "w") as f:
            f.write(text + "\n")
        os.replace(tmp, path)
        out.append({"task": s.ref(t), "text": text, "path": path})
    return out
