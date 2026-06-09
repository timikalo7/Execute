# Skills — Execute's procedural memory

This is where Execute saves reusable procedures it figures out — the Hermes-style "learned skill." Each skill is a folder with a `SKILL.md` that has YAML frontmatter:

```
---
name: stripe-clerk-nextjs
description: Wire Stripe payments + Clerk auth into a Next.js app. Use when a project needs subscriptions and authentication.
---
Step-by-step procedure...
```

Claude Code loads a relevant skill automatically when a task matches its `description`. The `learner` agent writes and refines these after each build — you don't create them by hand. They follow the agentskills.io open standard, so they're portable and shareable.
