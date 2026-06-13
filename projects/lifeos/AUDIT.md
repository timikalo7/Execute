# Impeccable Audit — LifeOS (round 2)

Ran the real Impeccable ruleset against the round-1 build. The first pass avoided
*some* tells but committed many of the cardinal ones. That's why it still reads as
AI-generated. Findings below, each mapped to the fix.

## Failed the "AI made that" test — Absolute Bans present

| # | Ban | Where I did it | Fix |
|---|-----|----------------|-----|
| 1 | **Gradient text** (`background-clip:text` + gradient) | `GradientText` on hero "your life", CTA accent | Delete component. Solid ink/ember; emphasis via weight + size. |
| 2 | **Glassmorphism as default** | `backdrop-blur` on nav, auth, demo gate, dashboard bar | Keep only the sticky nav (functional); flatten the rest. |
| 3 | **Hero-metric template** (big number + label + supporting stats) | Features "Daily Engine" tile w/ AnimatedNumber cluster | Remove the stat cluster; make the claim in prose + the real UI. |
| 4 | **Identical card grids** | Features bento, How (3 cards), ModelFlow (5 cards) | Asymmetric editorial layouts; vary rhythm; no icon+head+text tiles. |
| 5 | **Eyebrow on every section** (55–95% of AI gens) | `.eyebrow` on Model, Features, How, hero, panels… everywhere | One deliberate kicker total. Strip the rest. |
| 6 | **Numbered section scaffolding** ("01 · / 02 ·") | How section, ModelFlow chain numbers | Remove. (Onboarding step numbers stay — real sequence.) |
| 7 | **Ghost card** (1px border + shadow ≥16px together) | Hero preview card `border + shadow-[0_30px_80px]` | Border OR shadow, shadow blur ≤8px. |

## Codex high-frequency tells present

- **feTurbulence "paper grain" filter** — I shipped a `.grain` SVG noise overlay. Explicitly banned ("reads amateurish"). **Remove entirely.**
- **AI-tool glow** — `AuroraBackground` radial-gradient glow blobs are the canonical generated-hero backdrop. **Remove**; replace with structural editorial field (hairline rule grid + real image slot).
- **Section stagger ban** — uniform `whileInView` fade-up on every section is reflex scaffolding. **Individualize** each reveal.
- **Decorative motion** — `ShinyText` shimmer, `DotGrid` reactive field, `ClickSpark` bursts are decoration, not enhancement. Remove shimmer; drop DotGrid from hero; keep at most one delight moment.
- **Emoji in copy** — "🌿" in the dashboard empty state. Remove.

## Cream/beige anti-pattern (the 2026 default)

Dashboard `--paper` was `oklch(97% 0.008 85)` — warm-neutral L0.97/C0.008/hue85 = parchment. Hard-rule violation.

## Scene sentence → theme (forced, not defaulted)

> "A founder-athlete opens LifeOS at 5:50am in a still-dark room, pre-dawn blue at the window, the day not yet begun — they want one calm, authoritative screen naming the single most important thing to do."

The sentence forces **dark, instrument-grade, calm**. So:

## Decisions

- **Commitment scale: Restrained** for the product (dark ink ground, near-zero-chroma neutrals, a single **ember** accent ≤10%, sage only for completion). **Committed/editorial** for marketing moments.
- **Unify on dark.** Both marketing and dashboard run on the same warm-ink "command deck." Kills the cream trap and the light/dark inconsistency; more distinctive than either SaaS-cream or terminal-dark.
- **Two-altitude escape:** category "life-OS" → obvious families are *SaaS-cream* (avoided) and *terminal-dark* (avoided via Fraunces editorial serif display + ember, not mono-green-on-black). Real imagery + asymmetric editorial layout makes it non-obvious.
- **Imagery:** hero leads with the **real product UI** as its visual (Linear/Things strategy) + a reserved photographic slot (`/public/hero-*`) for Higgsfield art once the MCP is connected.

## Accessibility floor (enforce)

Body ≥4.5:1, large ≥3:1, placeholders ≥4.5:1. `text-wrap: balance` on h1–h3, `pretty` on prose. Body line-length 65–75ch. Display tracking ≥ -0.04em, clamp max ≤6rem.
