# Design

Visual system for LifeOS — the "Ink & Ember" command deck. Captured from the
live tokens (`app/globals.css`, `tailwind.config.ts`, `lib/fonts.ts`). OKLCH
throughout. Never pure black or white; no glow, grain, or gradient text.

## Theme

**Dark, by scene — not by default.** The physical scene: a deliberate person at
a desk before dawn, room still dark, one calm authoritative screen, a single
warm desk lamp. That scene forces a warm near-black ground with a single ember
(golden-hour) accent and cool-neutral text — a command deck, not a SaaS app and
not a neon terminal.

- **Color strategy:** Restrained (product floor). Tinted-neutral surfaces + one
  accent held to ≤10% of surface. One marketing surface (the landing) may run
  Committed per-task, but the app stays Restrained.
- **Color scheme:** `dark`.

## Color

OKLCH. Warmth lives in the ground and the accent, never injected into text
(text is chroma-0 neutral, tuned for AA against the ink ground).

### Surfaces — warm mineral ink (hue ~67, very low chroma)
| Token | OKLCH | Role |
|---|---|---|
| `--ink-deep` | `oklch(12% 0.006 65)` | recessed / deepest panels, modal scrim base |
| `--ink` | `oklch(16% 0.008 67)` | body ground (`--bg`) |
| `--ink-raised` | `oklch(20% 0.009 68)` | lifted surfaces, cards, the product panel |
| `--ink-graphite` | `oklch(27% 0.009 70)` | inactive / internal surfaces |
| `--ink-graphite-2` | `oklch(34% 0.009 72)` | top graphite tier |

### Accent — ember (the single committed color; focus, priority, the live mark)
| Token | OKLCH | Role |
|---|---|---|
| `--amber` | `oklch(78% 0.135 64)` | primary accent, CTAs, active, leverage |
| `--amber-rich` | `oklch(72% 0.145 56)` | richer ember for emphasis |
| `--amber-deep` | `oklch(60% 0.13 52)` | deep ember (use on light fills only — fails AA as text on ink) |
| `--amber-pale` | `oklch(88% 0.075 72)` | pale ember wash |

### Sage — completion / live ONLY (muted, never neon)
`--sage oklch(66% 0.075 158)` · `--sage-deep oklch(52% 0.075 160)` ·
`--sage-pale oklch(84% 0.05 154)`

### Clay — destructive only, sparingly
`--clay oklch(62% 0.16 36)`

### Text — neutral, chroma 0, AA against `--ink`
| Token | OKLCH | Contrast | Use |
|---|---|---|---|
| `--text-head` | `oklch(96% 0 0)` | ~15:1 | headings, primary |
| `--text-body` | `oklch(86% 0 0)` | ~10:1 | body |
| `--text-muted` | `oklch(68% 0 0)` | ~4.8:1 | secondary (meets AA body) |
| `--text-faint` | `oklch(56% 0 0)` | — | labels / large text only, NOT body |

### Hairlines (depth via borders + contrast, not shadow)
`--hairline oklch(96% 0 0 / 0.1)` · `--hairline-strong oklch(96% 0 0 / 0.2)`

## Typography

Three families, by register. The **landing (brand)** uses the display/body
pairing; the **app (product)** should lean on the grotesk and mono and keep
Fraunces out of UI labels, controls, and data.

- **Display — Fraunces** (`--font-display`), weights 300/400/500/600, normal +
  **true italic** (the italic is a real cut, used as a single accent word per
  surface — voice, not decoration). High-contrast editorial serif; used light
  (300) at large sizes. Heading ceiling ~4.4rem (within the ≤6rem ceiling);
  tracking floor honored (no tighter than ~-0.02em).
- **Body — Hanken Grotesk** (`--font-sans`), 400/500/600/700. A clean grotesk,
  deliberately **not Inter**.
- **Mono — JetBrains Mono** (`--font-mono`), 400/500. The "OS voice": metrics,
  data captions, functional micro-labels, the one landing `.kicker`.
- **Wrapping:** `text-wrap: balance` on h1–h3, `text-wrap: pretty` on prose.
- **Labels:** `.kicker` (mono, amber, tracked) used ONCE on the landing hero,
  never per-section. `.eyebrow` (mono, muted) is a *functional* micro-label for
  form fields / panel headers / data captions — not a decorative section
  eyebrow (those are banned and removed).

## Layout

- Max content width `--section: 1320px`.
- Depth is structural: hairline borders + background tier shifts + contrast.
  Avoid `border + box-shadow(blur≥16px)` pairings; minimal precise shadow only.
- `.grid-field` — a fine 64px rule grid, radially masked — is the structural
  backdrop that replaced the banned glow/grain.
- Border radius scale is tight: `xs 2 / sm 4 / md 6 / lg 8`. Cards top out at
  `lg` (8px); nothing approaches the 32px ban.

## Motion

- Framer Motion. Easing `cubic-bezier(0.22, 1, 0.36, 1)` (`ks`) — exponential
  ease-out, **no bounce, no elastic**.
- `prefers-reduced-motion` honored globally: `MotionProvider`
  (`MotionConfig reducedMotion="user"`) covers JS-driven transforms; a CSS
  `@media (prefers-reduced-motion: reduce)` block neutralizes CSS animation.
- **Register split:** the landing may run an orchestrated entrance; the
  **product** surfaces keep motion to 150–250ms state feedback, no page-load
  choreography (per the product register).
- `fade-up` keyframe + `marquee` (42s linear) are the only named CSS animations.

## Components

Built only from the project's tiered library: shadcn/ui base (Button, Badge),
Aceternity (ImageFrame), 21st.dev (Magnetic, Marquee, Bento), React Bits
(SplitText, ScrollReveal). Icons: Lucide. Every interactive element carries
default/hover/focus/active states; `::selection` is ember-on-ink.

### Imagery
`components/aceternity/image-frame.tsx` renders editorial photo slots wired to
`HERO_IMAGE` / `CTA_IMAGE` in `lib/assets.ts` (currently `null`). The no-image
fallback is a deliberate composed "pre-dawn InkField" so the layout ships
complete without a photo; a real image drops in via a one-line change and keeps
the duotone wash. Never animate `<img>` on hover — animate the frame instead.

## Absolute bans honored

No gradient text, glassmorphism-as-default, hero-metric template, identical
card grids, per-section eyebrows, numbered scaffolding (01/02/03), side-stripe
borders, ghost cards, glow blobs, paper grain, or container overflow.
Verified clean by `impeccable detect` (0 anti-patterns).
