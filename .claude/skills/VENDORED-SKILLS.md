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

## grilling + grill-me (from mattpocock/skills, MIT) — the interrogation engine
Vendored `skills/productivity/grilling/SKILL.md` and its `grill-me` trigger (**markdown only** — the
`agents/openai.yaml` configs were not vendored; no scripts exist in these skills). `LICENSE-mattpocock`
sits alongside `grilling/SKILL.md`.
- **What it gives Execute:** the method for stress-testing a plan before building — one question at a
  time, each with a recommended answer, walking the decision tree in dependency order, looking facts
  up in the environment rather than asking, and not acting until shared understanding is confirmed.
- **How Execute uses it:** `discovery-interrogation` (Execute's own skill) supplies the question bank
  and the required `Discovery.md` artifact, and delegates the *method* to `grilling`. Wired into
  `/kickoff` (step 3, before research), `/add-feature` (non-trivial features), and `/improve`.
- **Owner-invoked:** `/grill-me` remains available to grill any plan or decision on demand.
- An Execute addendum at the bottom of `grilling/SKILL.md` notes two non-relaxing clarifications: the
  single question may be rendered as an `AskUserQuestion` (clicking beats typing for this owner), and
  every session ends by writing `Discovery.md`.

## claude-seo (from AgricIDaniel/claude-seo, MIT) — SEO/GEO audit methodology
Vendored into `.claude/skill-library/claude-seo/`: **markdown only** — the 25 sub-skill playbooks
(`skills/`) and 18 sub-agent playbooks (`agents/`), plus their `LICENSE.txt` files and the upstream
`LICENSE-AgriciDaniel`. 171 files, zero executables.
- **NOT vendored (and not run):** `install.sh` / `install.ps1` / `uninstall.*`, `bin/`, `hooks/`
  (including `run-python-hook.js` and `validate-schema.py`), `scripts/`, `pdf/`, and every
  `extensions/*` (DataForSEO, Firecrawl, Ahrefs, Banana, SE Ranking, Bing Webmaster, unlighthouse) —
  these are installers, hooks, and paid-API integrations. Per the supply-chain rule, no scripts were
  run or vendored.
- **Consequence, stated plainly:** the methodology, checklists, and agent playbooks work. Any step
  that tells you to run `claude-seo run <script.py>` or needs a paid API extension does not run here —
  do the equivalent with Execute's own tools (`WebFetch`, `crawl-site`, `browser-drive`, `visual-qa`,
  Lighthouse) or record it as not-checked. Never report a skipped check as a pass.
- **How Execute uses it:** the `pre-publish-audit` skill (Execute's own) wraps it into the mandatory
  pre-flight before ANY website is published — gates first (visual-qa, security-gate,
  system-design-gate, e-commerce guideline), then the SEO/GEO sweep, then a prioritized fix list in
  `LAUNCH-CHECKLIST.md`.
- This also covers the **AEO/GEO** gap noted earlier (ranking in AI answer engines): see
  `skill-library/claude-seo/skills/seo-geo/`.
- To use the full plugin with its scripts, install it from its own repo in an interactive session.

## ponytail + ponytail-debt (from DietrichGebert/ponytail, MIT) — write less code
Vendored **only two of the six** upstream skills, deliberately, to avoid two idle overlapping tools:
- **`ponytail`** — the mode itself: laziest solution that works, YAGNI check on whether the task needs
  to exist, stdlib before custom code, native platform before a dependency, one line before fifty;
  intensity lite/full/ultra. Execute previously had only a passive *principle* saying "write less
  code" with no operational rule set — this is the delta. `memory/principles.md` was rewritten to
  point at this skill instead of restating it, so there is one source of truth, not two.
- **`ponytail-debt`** — harvests every `ponytail:` comment (each names its ceiling and upgrade path)
  into a debt ledger, so a deliberate shortcut cannot quietly become permanent. Execute had nothing
  equivalent.

**Deliberately NOT vendored** (already covered — vendoring them would leave duplicate idle tools):
- `ponytail-review` and `ponytail-audit` — over-engineering review of a diff / of the whole repo.
  Covered by the built-in `/simplify` and `/code-review`.
- `ponytail-gain` — a benchmark scoreboard display. `ponytail-help` — a menu.
- The repo's `hooks/` (JS), `ponytail-mcp/`, `scripts/`, and `install.*` were **not** vendored or run,
  per the supply-chain rule. Markdown only.

Published benchmark medians: ~54% less code (up to 94%), ~20% cheaper, ~27% faster vs the same agent
without the skill. Pairs with **RTK** (`.claude/hooks/vendor/rtk/`): ponytail cuts what the agent
*writes*, RTK cuts what the agent *reads*.

## scroll-world (from cth9191/scroll-world, MIT) — scroll-scrubbed cinematic landing pages
Vendored `SKILL.md` + `references/{gotchas,pipeline,prompts}.md` + the browser-side `scrub-engine.js`
and `index-template.html`. **Not vendored:** `knockout.py` (optional local image processing — use
Execute's own tools) and the plugin/marketplace manifests.
- **What it adds that nothing else here does:** scroll *scrubs pre-rendered video* — the camera flies
  through a world and scroll only drives time (the Apple scroll-through product-page technique). The
  scrub engine is source-agnostic, so with existing footage it needs **no generation credits**.
- **Explicitly distinguished from `premium-scroll-flow` so they don't sit as two idle overlapping
  tools:** `premium-scroll-flow` makes a *normal page* feel premium (Lenis, reveals, editorial
  numerals, font mixing) and is the default for most marketing sites; `scroll-world` is the heavy
  cinematic option, chosen only when the brief genuinely wants a fly-through. An addendum at the top
  of its SKILL.md states this and says not to run both.
- **Credit-gated:** asset generation goes through Higgsfield — check the balance in
  `memory/tool-credits.md` before planning a build around it (`mcp-and-prompt-craft`).
- **Before shipping:** video-heavy, so verify LCP/INP in `visual-qa`, give `prefers-reduced-motion` the
  stills fallback the pipeline already produces, and make the poster the clip's extracted first frame.
  `references/gotchas.md` (seam pop, byte-range/frozen video, encoding params, NSFW false-positives) is
  the highest-value file in the vendor.
