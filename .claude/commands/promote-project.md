---
description: Initialize the production project for an approved idea and build it through to a running MVP
argument-hint: [project name, or blank for the most recent]
---
Promote and build an approved project. Follow `CLAUDE.md` and `execute.md`. Requires `Requirements.md` to exist for the target (run `/approve` first if it does not).

Target: $ARGUMENTS — if blank, the most recently updated staged project that has requirements.

Create `projects/<name>/`, initialize the execution environment (repo, framework scaffold from the chosen stack, dependencies installed, `.env.example`), then run the build-through autonomously per `/approve` steps 3–4 until the quality gates pass. Write `projects/<name>/STATUS.md` when done.
