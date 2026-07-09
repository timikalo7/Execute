# Credits & acknowledgements

Execute is glue and process on top of a lot of other people's work. Everything below was used,
adapted, or drawn from as inspiration. If your work is here and you'd like the attribution changed
or removed, open an issue.

## Vendored skills (markdown only — no third-party scripts were bundled)
- **taste / design skills** — `redesign-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`,
  `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit`, `stitch-skill`, `output-skill`,
  `design-taste-frontend`, `premium-scroll-flow` — adapted from **Leonxlnx/taste-skill** (MIT).
- **caveman** (terse output-compression skill) — adapted from **JuliusBrussee/caveman** (MIT). Only
  the SKILL.md was vendored; its hooks/installers were deliberately not bundled (supply-chain rule).

See `.claude/skills/VENDORED-SKILLS.md` for exactly what was and wasn't vendored, and why.

## Ideas & patterns drawn from the community
- **Video perception** (`watch-video` skill) — mirrors the perception-layer idea of
  **jordanrendric/claude-video-vision**. Execute ships a dependency-light script version; the richer
  plugin is credited and linked, not bundled.
- **Agent hook / handoff discipline** (build agents commit per green unit + stash a WIP "hook" so a
  dead agent's successor resumes) — inspired by **steveyegge/gastown**'s hook/handoff model.
- **Cost awareness** — the `mcp-and-prompt-craft` credit discipline pairs with **ryoppippi/ccusage**
  (`npx ccusage`) for tracking Claude Code token spend.
- Several MCP/tool discoveries came from public creator reels/videos; the underlying tools are
  credited directly below rather than the reels.

## Tools, MCP servers & services referenced
- **Claude Code** and the **Claude Agent SDK** (Anthropic) — the host this runs in.
- **Playwright MCP** (Microsoft) and **Playwright** — browser automation.
- **sequential-thinking MCP** (`@modelcontextprotocol/server-sequential-thinking`, Anthropic/MCP).
- **Composio** — SaaS-action connector layer.
- **Ideogram**, **Higgsfield** — image/video generation MCPs.
- **Firecrawl** — optional keyed backend for the `crawl-site` skill (keyless BFS crawler is default).
- **Pexels** — keyless stock photography for the `curated-stock-backgrounds` skill.

## UI / frontend libraries the design rules compose from
shadcn/ui · Aceternity UI · 21st.dev · React Bits · Lucide · Framer Motion · anime.js ·
Tailwind CSS · Next.js · Expo / React Native. Each under its own license.

## Security & system-design knowledge
The `memory/` law files distill widely-published guidance — OWASP Top 10, WCAG 2.1 AA, and standard
system-design patterns (idempotency, event sourcing, transactional outbox, presigned uploads) — into
a runnable gate. No proprietary material is reproduced.
