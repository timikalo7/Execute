# Skill Library — vetted, NOT auto-loaded

This directory holds external skill packs referenced in `execute.md` §4.1/§4.2 that have been **cloned and
vetted but deliberately kept out of `.claude/skills/`** so they do **not** auto-load. Several carry
executable scripts (e.g. `impeccable` ships a browser/DOM detector, `llm-council` runs `query_llms.py`
against external APIs, `ui-styling` has Python helpers). Auto-loading untrusted third-party code as startup
config is a supply-chain risk, so these live here as a reference shelf instead.

**How to use one:** when a build genuinely needs a skill, copy that single folder into `.claude/skills/`
on demand (review its scripts first; for script-bearing skills, confirm with the owner). Remove it again
when done, or keep it if it earns its place.

**Index & provenance:** see `memory/tool-notes.md` → "Skill library (vetted, shelved)".

Contents (23): `llm-council`, `impeccable`, `karpathy-guidelines`; ui-ux pack (`banner-design`,
`design-system`, `brand`, `design`, `slides`, `ui-ux-pro-max`, `ui-styling`); taste pack (`brandkit`,
`redesign-skill`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `soft-skill`, `brutalist-skill`,
`minimalist-skill`, `taste-skill`, `taste-skill-v1`, `gpt-tasteskill`, `stitch-skill`, `output-skill`,
`image-to-code-skill`).
