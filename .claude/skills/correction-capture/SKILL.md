---
name: correction-capture
description: >
  Find and record the moments the OWNER corrected Execute. Run at every milestone (the learner
  calls it) and whenever asked what Execute has been told off for, what it keeps getting wrong,
  or what the owner has already said. Scans the session transcript for corrective owner turns and
  emits candidates for `memory/corrections.md`. Use when closing out a build, when writing a
  post-mortem, or before repeating a decision the owner may already have ruled on.
---

# correction-capture — the episodic layer for the owner's corrections

Reel `DcbHSb1Ib3N` named the standard agent-memory taxonomy: **episodic** (what happened),
**semantic** (what is true), **procedural** (how to do it). Execute already had all three under
other names — `PROJECT-LOG.md` + `postmortems/`, `memory/*.md`, `.claude/skills/`.

The gap the taxonomy exposed: **the episodic layer records what Execute did, never the moments the
owner said "no."** Those are the highest-value events in the system — every one of them changed
how Execute works — and they were surviving only when somebody remembered to write them down.
That is the same failure that lost the agent-farm reel (`ideas/INBOX.md`). So this is a scanner,
not a reminder.

## Run it

```bash
node .claude/skills/correction-capture/scan.mjs                       # newest transcript for this project
node .claude/skills/correction-capture/scan.mjs --since 2026-08-20    # only recent turns
node .claude/skills/correction-capture/scan.mjs --selftest            # 32 assertions, both directions
```

Then read the candidates, keep the real ones, and append them to **`memory/corrections.md`** with
what each one actually changed. **The scanner does not decide** — it produces candidates and says
so in its own output. A regex cannot tell a correction from a sharply-worded new instruction; it
can only make sure neither is lost.

## How it classifies

Two tiers, because one flat keyword list is either too noisy to read or too narrow to catch
anything. **Strong** signals stand alone — second-person negation (*"u didnt"*), demonstrative
rejection (*"thats not"*), an assertion the owner already said otherwise (*"i said"*, *"i alr"*),
a standing amendment (*"next time"*, *"from now on"*), scope narrowing (*"only applies to…"*),
flat quality rejection (*"its trash"*). **Weak** signals need a second — bare `not`, `never`,
`actually`, `instead` appear in ordinary instructions constantly.

## What running it against real data taught

Two things that reading the code would not have:

1. **Scope narrowing had to be promoted to a strong signal.** *"only applies to linkedin"* — the
   three-domains correction, one of the most consequential ever made — scored 1 and was missed.
2. **Not everything wearing a user role was typed by the owner.** Compaction summaries, injected
   skill bodies and local-command output arrive as user turns and are *full* of corrective
   vocabulary — a summary of a session about corrections reads exactly like a correction. Four of
   the first seventeen hits were machine text. `MACHINE_PREFIXES` filters them; 17 → 13 on the
   same transcript, with every real correction retained.

Both are covered by assertions now, in both directions: the must-flag list is real owner
corrections, the must-not-flag list is ordinary instructions from the same sessions. A classifier
proven only on what it should catch is not proven — the expensive failure here is flagging
everything until the report is too noisy to read, and only the must-not-flag list catches that.

## The limit, stated

It reads **one transcript on one container**, and this container is wiped between sessions. It
cannot recover corrections from sessions whose transcripts are gone — the same wall that lost the
agent-farm reel. It reduces the loss going forward; it does not undo the loss already taken.
That is why `memory/corrections.md` is committed and the transcript is not.
