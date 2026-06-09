# EXECUTE

**Drop in an idea. Get a built, tested, running project.**

Execute is an autonomous idea-to-project engine that runs as a [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) project. It optimizes your idea, researches it, checks whether it's viable and worth building, then — once you approve — builds and tests it until it runs.

## Quickstart

1. Install Claude Code (see `SETUP.md`).
2. Open this folder in Claude Code.
3. Put your idea in `ideas/` (a file), or pass it inline.
4. Run: `/kickoff <your idea, or ideas/your-file.md>`
5. Review the plan + viability verdict, then run `/approve`.
6. Execute builds it. When it stops, read `projects/<name>/STATUS.md`.

A seeded example is included — try it right away:

```
/kickoff ideas/lifeos-engine.md
```

## What's in here

- **`CLAUDE.md`** — the operating brain, auto-loaded by Claude Code.
- **`execute.md`** — the full playbook: the Fixy method, the 10-phase workflow, the Viability Gate frameworks, the tool library, and the engineering standards.
- **`.claude/commands/`** — the commands: `/kickoff`, `/approve`, `/promote-project`, `/status`, `/analyze`, `/improve`, `/add-feature`, `/fix-issues`.
- **`.claude/agents/`** — the build team: research, viability, pm, developer, designer, qa, product.
- **`ideas/` · `potential-projects/` · `projects/`** — the pipeline folders.

## The one stop

Execute runs hands-off except for a single approval checkpoint — by design. That's where you decide whether to build the thing and adjust the plan. To skip it on a given run, just tell Execute to auto-approve if viability passes.

## What it can and can't do for you

- **Builds:** scaffolds the repo, installs dependencies, writes and runs code, tests, and iterates until the MVP runs locally.
- **Can't provision your accounts:** for paid/account-gated services (Stripe, Clerk, Neon, Resend, Cloudflare, etc.) it wires the integration and lists the exact keys you need in `projects/<name>/SETUP-KEYS.md`, then keeps building everything else. Add your keys to finish deployment.
