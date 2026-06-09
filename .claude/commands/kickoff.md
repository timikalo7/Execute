---
description: Take an idea from raw input through optimization, research, structuring, and the viability gate, then present the plan for approval
argument-hint: <idea text, or a path to a file in ideas/>
---
You are running the EXECUTE kickoff for a new idea. Follow `CLAUDE.md` and `execute.md`.

**First, load what Execute has learned.** Read `memory/principles.md`, `memory/tool-notes.md`, and `memory/user-profile.md`, and note any Skills in `.claude/skills/` whose description matches this idea. Apply that accumulated knowledge throughout this run.

The idea is: $ARGUMENTS
- If `$ARGUMENTS` is empty, use the most recently modified file in `ideas/`.
- If it is a file path, read that file.
- Otherwise treat it as the idea text and first save it to `ideas/<slug>.md`.

Then proceed without stopping for permission and do all of the following:

1. **Fixy** — optimize the raw idea into a precision-crafted brief (intent, entities, context, output requirements, constraints). Target AI defaults to Claude.
2. **Capture & classify** — confirm it is a project (not a task/note/reminder). Create `potential-projects/<name>/` and write `Raw Idea.md`.
3. **Research** — delegate to the `research` subagent. Market validation, competitors, existing solutions, and a tool scan drawn ONLY from `execute.md` Part 4. Write `Research.md` with a tool-stack recommendation (best / lowest-cost / fastest / most-scalable).
4. **Structure** — write `Proposed Plan.md`: objective, scope, features, risks, dependencies, recommended stack (from the library only).
5. **Viability Gate** — delegate to the `viability` subagent. Score against both playbooks in `execute.md` Part 3. Write `VIABILITY.md` with the verdict on the three questions (viable / worth doing / will it go viral), the PASS/WEAK/FAIL call, and the consumer-vs-advisory bucket.

Finally, present a concise summary in chat — the optimized brief, the viability verdict, and the proposed plan — then STOP. Tell the person to review/edit and run `/approve` (or tell you to auto-approve if viability passed). Do not begin building yet.
