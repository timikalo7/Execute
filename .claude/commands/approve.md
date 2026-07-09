---
description: Approve the staged project and autonomously generate requirements, promote, build, test, and learn until the quality gates pass
argument-hint: [project name, or blank for the most recent]
---
The person has approved the staged project. Follow `CLAUDE.md` and `execute.md`, and proceed AUTONOMOUSLY — do not ask permission for routine steps (writing files, installing dependencies, running builds/tests, fixing your own errors).

**First, load Execute's memory** — read `memory/principles.md`, `memory/tool-notes.md`, `memory/user-profile.md`, and any matching Skills in `.claude/skills/`. Apply them.

Target project: $ARGUMENTS — if blank, the most recently updated folder in `potential-projects/`.

If `VIABILITY.md` says FAIL, do not build: surface why and recommend a pivot.

Otherwise:
1. **Requirements (Phase 6)** — write `Requirements.md` (PRD), `Technical Spec.md`, and `Success Metrics.md`. Select the stack ONLY from `execute.md` Part 4. Honor every hard build rule in `CLAUDE.md`.
2. **Promote (Phase 7)** — create `projects/<name>/`, initialize it (repo, framework scaffold, dependencies installed), and a `.env.example`. Record any account-gated keys in `projects/<name>/SETUP-KEYS.md`.
3. **Agent team (Phase 8)** — drive the build via the `pm` subagent, delegating to `developer`, `designer`, `qa`, and `product`.
4. **Build & test (Phase 9)** — build the smallest version that delivers the core value (MVP-first), run it, test it (`qa`), and iterate until the quality gates in `execute.md` pass.
5. **Learn** — delegate to the `learner` subagent: run the learning loop on the finished project — post-mortem, new principles, tool notes, user-profile updates, and any reusable Skills. This is how Execute compounds.

Keep going until the MVP runs and the success metrics are demonstrable. Pause only for a genuine blocker (a missing credential, or a scope-changing decision the plan did not settle). When done, write `projects/<name>/STATUS.md` and report: what runs, how to run it, what is left, which keys (if any) the person must supply to deploy, and what you learned.
