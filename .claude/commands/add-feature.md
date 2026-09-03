---
description: Add a feature to a running project
argument-hint: <project name> — <feature description>
---
Add a feature. Input: $ARGUMENTS (project name, then the feature). **If the feature is non-trivial (anything beyond a mechanical one-file edit), run the `discovery-interrogation` skill first** — grill the owner one question at a time (each with your recommended answer, rendered as an `AskUserQuestion`) on only the forks that change the build: scope of "done", who it's for, whether it touches auth/payments/user data, any design reference, and what's explicitly out of scope. Append the answers to the project's `Discovery.md`. Then follow `CLAUDE.md` and `execute.md`: write the feature into the spec, build it (MVP-first), honor the hard build rules and UI rules, test it (`qa`), and update `STATUS.md`. Proceed autonomously; pause only on genuine blockers.
