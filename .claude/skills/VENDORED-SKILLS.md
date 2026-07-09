# Vendored third-party skills — provenance, precedence, vetting

These skills were `git clone`d from the tool-library repos, **vetted (markdown only — no scripts,
binaries, installers, or network calls were vendored)**, and integrated as additive tools. They live
here so they auto-load when their description matches.

## Precedence (they serve UNDER the owner's laws, never override them)
1. **`owner-design-taste`** is the governing **design LAW**. On any conflict between a vendored skill and
   owner-design-taste, owner-design-taste wins. The vendored design skills are *generators / style-modes
   / reference tools* applied within it.
2. **`caveman-mode`** governs communication + working cadence (terse, commit-often). It always applies.
3. **`custom-components-ideator`**, **`safe-scroll-reveal`**, **`visual-qa`**, and the Execute memory
   (`memory/*`, esp. `webapp-security-principles.md`) are the other standing laws — vendored skills defer
   to them.

## What was vendored (from Leonxlnx/taste-skill, MIT)
- **redesign-skill** — audit + upgrade an existing site/app to premium (de-slop). Pairs with a redesign brief.
- **soft-skill** — high-end-agency concrete specs (fonts, spacing, shadows, card structures).
- **minimalist-skill** / **brutalist-skill** — two opinionated aesthetic modes to pick when a brief calls for them.
- **imagegen-frontend-web** / **imagegen-frontend-mobile** — premium design-reference image direction (pairs with the Higgsfield MCP).
- **brandkit** — brand-guideline / identity board generation.
- **stitch-skill** — emits an agent-friendly `DESIGN.md` design-system contract.
- **output-skill** — enforces complete, non-truncated code output; bans placeholder patterns.

## What was deliberately NOT vendored (and why)
- **pbakaus/impeccable** (127 MB) — a full Astro app + Cloudflare functions + browser-extension + live
  DOM/CSP scripts. Redundant with the `visual-qa` skill and far too heavy + script-laden to vendor.
  If wanted, install it via its own CLI in an interactive session, not vendored into this repo.
- **nextlevelbuilder/ui-ux-pro-max** (20 MB + Python search tooling) — a DB-backed design-intelligence
  skill designed to be *installed via its own installer*. Note it in `tool-notes.md`; don't vendor 20 MB.
- **The generic `taste-skill` / `taste-skill-v1` / `gpt-tasteskill`** — overlap and would compete with
  `owner-design-taste` (the LAW). Skipped to avoid a conflicting second design authority.

## Rule this integration proves
Per `memory/webapp-security-principles.md` §5: **never auto-load a third-party skill without reading the
scripts it runs.** Only vetted, script-free markdown was vendored. To add any of the skipped items, ask —
the specific repo gets reviewed first, not bulk-imported.

## caveman (from JuliusBrussee/caveman, MIT) — communication compression
Vendored the core `caveman` **SKILL.md only** (markdown; ~65% output-token compression with intensity
levels lite/full/ultra + wenyan, and an **auto-clarity rule that drops terseness for security warnings,
irreversible-action confirmations, and ambiguous multi-step sequences**). It works WITH the owner's
`caveman-mode` (which stays the governing cadence/preference law); `caveman` supplies the detailed
compression ruleset + intensity switch.
- **NOT vendored:** the plugin's SessionStart/UserPromptSubmit **hooks** (`src/hooks/*.js`), the
  `install.sh`/`install.ps1`/`bin/install.js` installers, and `caveman-compress` (uses `subprocess` +
  the Anthropic API — its own SECURITY.md documents this). Per the supply-chain rule, no scripts were run
  or vendored.
- **For the full automatic mode** (hooks auto-activate compression every turn + `/caveman` commands +
  sub-skills like caveman-commit/review/stats), install it as a proper plugin from its marketplace in an
  interactive session — that's where its hooks belong, not auto-loaded into this repo.
