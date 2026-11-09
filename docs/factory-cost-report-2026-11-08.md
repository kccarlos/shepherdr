# Where the factory's tokens went (2026-11-08)

The first full day of the factory, from 01:30 to 14:50, ending in a full stop the person asked for. Data comes from local Claude Code transcripts (`~/.claude/projects/`), the task store, and codexbar readings. Script: `token_report.py` in the orchestrator's scratchpad.

## Numbers

**Claude**, in input-token equivalents. Weights follow Anthropic's price ratios: input 1, cache write 1.25, cache read 0.1, output 5. Raw counts: about 905M cache-read tokens, 9.3M cache-write and 2.5M output.

| Who | Sessions | Input-equivalent | Share |
|---|---|---|---|
| Workers (implementers) | 44 | 63.1M | 55% |
| Assistant (coordinator) | 2 | 25.9M | 22.5% |
| Orchestrator (the person's session) | 1 | 21.8M | 19% |
| Orchestrator's subagents (research, design review, the agents-agreeing experiment) | 4 | 2.9M | 2.5% |
| Claude reviewers (extra Opus rounds) | 9 | 1.2M | 1% |
| **Total** | | **114.9M** | |

Claude weekly went from 30% to 9% left. The 5-hour window was emptied twice.

**Gemini (Argon reviewers):** agy keeps its counts in protobuf blobs, so this report uses quota instead. Weekly went from 83% to 56% left: 27 points in 13 hours, at a pace that would empty it in about a day against a 5-day reset. There were 177 agy conversations and 129 recorded review rounds over 51 tasks.

**Gemini, measured** (an agy run decoded agy's own records): 597M tokens over 178 conversations and 4,846 model calls. 91% were cache reads.
- **98% went to reviewers** (163 conversations). Other runs, such as the FAC-1 audit, used 2%.
- **The top spenders by task were two documents:** FAC-34, the sheepdog note, at 53M over 8 reviewer conversations, and FAC-32, the usage plan, at 34M. Next came FAC-49 (sandbox, 46M), FAC-15 (G4, 33M), FAC-9 (29M) and FAC-14 (G3, 29M).

## Findings

### 1. Endless review-and-fix loops (the main waste)
- **14 tasks needed 5 or more review rounds.** Their median cost is **2.4M**, against **0.9M** for tasks done in 3 rounds or fewer: 2.7 times as much.
- **G4 (merge in code) took 7 rounds and is still not done**, at 4.4M, the most expensive task. G3 took 8 rounds, FAC-9 took 7.
- **Documents looped too.** The sheepdog note FAC-34 took 7 rounds (2.6M), and the usage plan FAC-32 took 6 (2.2M).
- **Nothing stopped a loop.** No rule asked "is this converging?". The "two failed fixes means stop" rule lived only in briefs. Raising the round limit (2, then 4, then 5) fed the loops instead of ending them.

### 2. Coordination cost: 41.5% went to the two coordinators
- **The Assistant ran one session for 13 hours:** 701 turns, each re-reading about 333k tokens of context. Every news line, every worker question and every nudge re-reads all of it.
- **The orchestrator:** 496 turns at about 384k each. Its 15-minute polling loop, plus answering the Assistant's escalations, often for decisions already delegated.
- **The escalations came back** because the delegation lived only in chat, which context compaction drops, while Shepherdr's assistant.md tells it the person decides.

### 3. Paperwork priced like code
- **Audits, plans, notes and reports** (FAC-19, 25, 26, 32, 34, 35 and others) cost about 12M or more, at least 10% of the total. Each one got a worktree, a brief and 3 to 7 Argon rounds, like code.

### 4. Friction we caused ourselves
- **Permission prompts** blocked reviewers for hours across the day. Every retry, replaced reviewer and duplicate reviewer (`-revi-2`) re-read the whole diff.
- **The gate's wrong diff base** once fed a reviewer 939 lines of other merged work.
- **macOS consent prompts** stopped the factory for 3 hours and 15 minutes. That cost time, not tokens.
- **Scope grew faster than it was cut.** The auto-merge hardening (G5 to G7 and FAC-30/46/47) was planned, then cancelled the same day as over-engineered.

## What changes: recap, then decide; never grind

**Rule: a task that is not converging stops and recaps, and someone else decides its direction.**

1. **Triggers (in code, the tick checks each one):**
   - a third round still has a finding at must-fix or above;
   - the finding count does not drop over two rounds;
   - the same file or area is flagged in two rounds;
   - the task has used more than twice its token or time estimate.
2. **On a trigger, the worker stops and writes a recap** of half a page or less:
   - the goal;
   - what it tried, round by round;
   - what keeps failing, and the premise behind it;
   - the options: one more round, split, change approach, drop.
3. **The Assistant decides, not the worker:**
   - one more round, allowed once;
   - split into smaller tasks;
   - a new approach under a new brief;
   - drop it;
   - or ask the person.

   The decision and why go in the trial log. A second trigger on the same task means it changes direction; it cannot get another round.
4. **A factory recap every few hours:** which areas converge, which churn, and spend per area. The orchestrator reads it and cuts scope that isn't paying off.

**Cheaper coordination:**
- Restart the Assistant and the orchestrator in fresh sessions every few hours, with a written handoff, so each turn re-reads less.
- Wake on events rather than polling every 15 minutes.
- Delegation lives in the Assistant's template (FAC-52), not in chat.

**Cheaper review:**
- Delta-only from round 2 (FAC-53), and never two reviewers on one task.
- Docs and plans: one round, or none when the person reads them anyway. No separate paperwork tasks unless the person must decide.
- Spend the pool that expires first (Opus reviews before a Claude reset).

**Scope:**
- Smallest version first. Full auto-merge stays deferred; the orchestrator's checks before Accept already catch worker shortcuts.
