---
description: Run the Execute learning loop on a project — evaluate, distill principles, record tool notes and a post-mortem, and write reusable skills
argument-hint: [project name, or blank for the most recent]
---
Run the learning loop via the `learner` subagent on the target project: $ARGUMENTS (blank = the most recently updated folder in `projects/`).

Evaluate what worked and what did not, then update Execute's memory: a post-mortem in `memory/postmortems/`, new principles in `memory/principles.md`, gotchas in `memory/tool-notes.md`, preferences in `memory/user-profile.md`, and any reusable procedure as a Skill in `.claude/skills/`. Only keep distilled, reusable knowledge — never secrets or raw transcripts. Report what was learned.
