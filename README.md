# Execute

An autonomous **idea-to-outcome** operating layer for [Claude Code](https://claude.com/claude-code)
that **learns**. Drop in an idea; Execute plans it, delegates the build to specialized sub-agents,
verifies the result with real tools (not self-attestation), ships it, and writes down what it learned
so the next run is sharper.

**Not repo/build-centric.** Code projects are the common case, not the boundary. The same loop —
**plan → delegate → verify → learn** — serves research, content, operations, actions in third-party
apps, watching/analyzing media, crawling references, and driving a live browser.

> Execute is a **configuration layer** (instructions, sub-agent definitions, skills, memory, and
> git-enforced quality gates) that runs inside Claude Code. It is not a standalone app. You bring
> your own Claude Code and your own API/tool keys.

## What's in here

| Path | What it is |
|---|---|
| `CLAUDE.md` | The operating brain — hard rules the agent follows every session. |
| `execute.md` | The full playbook: optimization method, workflow phases, viability gate, tool library, engineering standards. |
| `.claude/agents/` | The sub-agent team (research, viability, pm, developer, designer, qa, product, security-reviewer, learner). |
| `.claude/skills/` | Reusable procedures that auto-load when relevant (visual-qa, security-gate, watch-video, crawl-site, browser-drive, design skills, and more). |
| `.claude/hooks/` | SessionStart rule/memory injection + a PreToolUse pre-push quality gate. |
| `.githooks/` | Git-level pre-push gate (security + system-design + learner + visual-qa). |
| `memory/` | Execute's persistent brain: `principles.md`, `tool-notes.md`, security/system-design law, and a `user-profile.md` **template** you personalize. |
| `.claude/skill-library/` | Vetted skills kept on the shelf, NOT auto-loaded — pull one into `.claude/skills/` when a project needs it. |
| `.env.example` | Every environment variable the repo reads, all optional, each saying what breaks without it. Copy to `.env`. |
| `SETUP-KEYS.md` | The credential table — what each key unlocks and where to get it. Nothing here is required to run Execute. |
| `CREDITS.md` | Attribution for every vendored upstream skill and the tools the playbook draws on. |

## Quick start

1. **Have Claude Code.** Install and sign in ([docs](https://code.claude.com/docs)).
2. **Clone this repo** and open it as your project, or copy `.claude/`, `memory/`, `CLAUDE.md`, and
   `execute.md` into an existing project.
3. **Personalize `memory/user-profile.md`** — it ships as a template describing a generic user; put
   your own design taste, communication style, and product instincts there.
4. **Wire the keys you want** (all optional; the framework runs without them). See `SETUP-KEYS.md`
   for what each one unlocks and `.env.example` for the full list. MCP servers live in a `.mcp.json`
   you create; credit-gated tools are documented in `.claude/skills/mcp-and-prompt-craft`.
5. **Enable the git hooks** (optional but recommended): `git config core.hooksPath .githooks`.
6. Start a session and give it an idea. See `execute.md` for the `/kickoff → /approve` flow.

## The quality gates (why builds don't lie)

Execute refuses to trust "it's all good." Front-end changes must pass a real headless-browser
**visual-qa** sweep (WCAG AA via axe-core, overflow, console errors); any backend/secret surface must
pass a runnable **security-gate** (secret scan, TLS checks, `npm audit`) and **system-design-gate**
(lockfile, `.env.example` coverage, no string-built SQL, no tokens in localStorage). A **pre-push
hook blocks pushes** that fail any gate or omit a `PROJECT-LOG.md` learning entry. Fix and re-push.

## The learning loop

Execute is **not stateless**. Before building it reads `memory/`; after each milestone a `learner`
sub-agent distills what worked and what broke into principles, tool notes, and reusable skills — so a
problem solved once is reused automatically.

## Customize it

- **`memory/user-profile.md`** — your taste and preferences (ships as a replaceable template).
- **`.claude/skills/owner-design-taste`** and **`caveman`** — example design-taste and terse-comms
  profiles; keep, edit, or delete them.
- **`.claude/agents/*.md`** — swap model tiers or instructions per your plan/quota.

## Credits

Execute stands on a lot of other people's work — vendored skills, community ideas, MCP servers, and
UI libraries. See **[CREDITS.md](./CREDITS.md)**. Licensed MIT (see `LICENSE`).

## Status

This is a personal framework shared for friends to test and use. No warranty; expect rough edges.
Issues and PRs welcome.
