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

## The design & graphics framework

Most of the difference between "an AI built this" and "someone built this" is here. Execute does not
let an agent invent a look per page; interfaces are composed from a fixed set of libraries in a fixed
ratio, then verified by a real browser.

**The composition ratio** — every web interface is assembled from these, in roughly this mix:

| share | tier | libraries |
|---|---|---|
| 10% | base components | shadcn/ui (or an equivalent headless system) |
| 30% | advanced animated | Aceternity UI |
| 30% | premium micro-interactions | 21st.dev |
| 30% | experimental effects | React Bits |

**OriginKit** (~50 animated components and whole prebuilt sections) feeds the two animated tiers — it
is another source for them, not a fifth tier, and it can be connected as an MCP server so components
are *read* rather than invented. Icons are Lucide; maps are Leaflet.

**Motion.** Framer Motion for React component animation, anime.js for lightweight one-offs, and
**GSAP** — now free including ScrollTrigger, SplitText and MorphSVG — for scroll-driven timelines and
pinned scrollytelling. **Vanta.js** and React Three Fiber cover WebGL backgrounds and 3D scenes,
under a hard shipping condition: route-split or lazily mounted so 3D never blocks first paint,
Core Web Vitals *measured* in `visual-qa` rather than assumed, and a static fallback under
`prefers-reduced-motion` — which is a WCAG obligation, not a nicety, since a spinning hero is
vestibular-triggering.

**Design skills** (`.claude/skills/`) — a governing taste law plus subordinate style modes and
generators:

- `owner-design-taste` — the design **law**. Everything else defers to it. Yours to rewrite.
- `design-taste-frontend`, `redesign-skill`, `soft-skill` — anti-slop direction, audit-first
  upgrades of an existing site, and the concrete specs (type, spacing, shadows) that read as expensive.
- `minimalist-skill`, `brutalist-skill` — two opinionated aesthetic modes to pick when a brief calls
  for one.
- `custom-components-ideator` — turns a domain into a per-section list of *bespoke* mechanics, so a
  page gets its own interactions instead of a template's.
- `premium-scroll-flow`, `scroll-world`, `cursor-reveal-hero`, `safe-scroll-reveal`,
  `receipt-printer` — scroll-scrubbed cinematic flights, reveal heroes, SSR-safe scroll reveals that
  do not fight hydration, and a printing order receipt.
- `imagegen-frontend-web` / `-mobile`, `brandkit`, `stitch-skill` — design-reference image direction,
  brand-identity boards, and an agent-readable `DESIGN.md` design-system contract.
- `curated-stock-backgrounds` — real royalty-free photography with no API key.
- `document-design` — the same standard applied to documents (reports, decks, CVs), so a generated
  `.docx` does not look generated.

**Verification.** `visual-qa` drives real headless Chromium: WCAG AA via axe-core, overflow at three
widths, console errors, committed pixel baselines with a tolerance, plus `pixel-profile` and
`fidelity` for measuring a build against a reference. It **fails the build** — the eyeball does not
count, and a stamp hash-matched to the tree is what the pre-push hook checks for.

## The agent graph

Nine sub-agents (`.claude/agents/`), run as a graph rather than one loop — each on its own metric,
so no single metric runs away with the outcome:

`research` · `viability` · `pm` · `developer` · `designer` · `qa` · `product` · `security-reviewer` · `learner`

Three rules bind every run:

1. **Evaluators judge the artifact, never the builder's reasoning.** `qa`, `product` and
   `security-reviewer` are spawned in fresh context with the spec and the built thing — never the
   builder's transcript, or the tester inherits the builder's blind spots.
2. **Handoffs are artifacts** — commits, files, log entries, gate stamps. Not conversations.
3. **Check the checker.** Never weaken a gate to make a push pass. A gate that greenlights a known-broken
   tree is a bug in the gate. Prove a new gate rule *fails* on bad input before trusting its pass, and
   treat a skipped check as loud, never as a pass.

**Model tiers** are set per agent in frontmatter: cheap models for ideation, the strongest reasoning
for planning and judgment, and the build delegated to separate agents — so the planning thread
orchestrates rather than hand-builds. Swap them to match your own plan and quota.

## Beyond the browser

The same plan → delegate → verify → learn loop runs on non-code work: `watch-video` (frames plus
transcript, so the agent can actually watch a clip), `crawl-site` (a whole site into local markdown,
keyless by default), `browser-drive` (Playwright for forms, logins, SPA scraping, reproducing a bug),
`read-unfamiliar-code` (read a dependency's real source instead of its README), and
`second-opinion` (an independent review from a non-Anthropic model — the one evaluator that does not
share the blind spots of whatever wrote the code).

`.claude/skill-library/` holds a further set vetted but **shelved** — not auto-loaded. Pull one into
`.claude/skills/` when a project needs it.

## The quality gates (why builds don't lie)

Execute refuses to trust "it's all good." Front-end changes must pass a real headless-browser
**visual-qa** sweep (WCAG AA via axe-core, overflow, console errors); any backend/secret surface must
pass a runnable **security-gate** (secret scan, TLS checks, `npm audit`) and **system-design-gate**
(lockfile, `.env.example` coverage, no string-built SQL, no tokens in localStorage). A **pre-push
hook blocks pushes** that fail any gate or omit a `PROJECT-LOG.md` learning entry. Fix and re-push.

Three more run inside that same pre-push hook:

- **`runtime-eval`** — runs the product the way a person will, end to end. Every other gate *reads*
  the artifact; this one executes the journey, because unit tests are written by whoever wrote the bug.
- **debt + warning ratchets** — honest markers (`TODO(keys)`, `NOT CHECKED`, `unverified`) are counted
  with a budget. Over budget fails; under budget ratchets the budget down. The number can only fall,
  so a new class of problem cannot arrive quietly.
- **`sdlc-chain`** — checks a project left the artifact trail it should have: an intent, a spec, a
  plan, verification, a deploy record.
And one runs at a different moment: **`pre-publish-audit`** is mandatory before a site goes live —
the gates first, then a technical/on-page/schema/GEO sweep so AI answer engines can cite the site,
written into a prioritized fix list. It is a launch gate, not a push gate.

Supporting these: **`gate-protections`** and **`not-get-sued-101`** ship the working code behind every
rule that could otherwise only report an absence — a webhook that verifies its signature, an upload
validated by magic bytes, the XSS answer, command/SQL injection refusals, rate limiting, timeouts.

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
