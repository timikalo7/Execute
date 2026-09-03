---
description: Propose and implement upgrades to a running project
argument-hint: [project name]
---
Improve the target project: $ARGUMENTS. **First run the `discovery-interrogation` skill** — before proposing upgrades, grill the owner one question at a time (each with your recommended answer, rendered as an `AskUserQuestion`) on what they actually want improved and what "better" means here: what's annoying them right now, which axis matters most (speed · reliability · design · cost · security), and what must NOT change. Record it in the project's `Discovery.md`. A guessed improvement list wastes a build pass. Then, following `execute.md` standards, identify high-leverage upgrades (per the decision hierarchy: simplicity, reliability, scalability, security, maintainability, cost, performance), implement them, run and test, and update `STATUS.md`. Proceed autonomously; pause only on genuine blockers.
