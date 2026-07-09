---
name: premium-scroll-flow
description: Give a web/landing page the "premium, not a standard site" feel — mine a reference site for its signatures, then implement smooth scroll (Lenis) + scroll-triggered reveals + oversized editorial section numerals + dramatic font mixing. Use when the brief is premium/cinematic/editorial/agency/Awwwards-style, when the owner links reference sites and wants their FEEL (not just admiration), or when a page is rejected as "generic / a boring standard site".
---

# Premium scroll flow (reference-mine → implement the feel)

What separates a "premium" page from a "standard" one is mostly **flow** — smooth scroll +
scroll-driven motion — plus a few editorial signatures (oversized numerals, font mixing,
full-bleed imagery). This skill turns an admired reference into a concrete, implemented look.
Built for a Next.js + React + Tailwind + framer-motion stack (adapt to the project's actual stack).

## When to reach for this
- Brief is premium / cinematic / editorial / agency / "Awwwards" / "Linear-style".
- The owner links reference sites (webflow/agency portfolios) and wants their *signatures*, not a vibe.
- A page came back as "generic", "templated", or "a boring standard site".
- (If the project's `user-profile.md` says the owner treats flow as table stakes, default to it.)

## Step 1 — Mine the reference (don't guess what makes it feel premium)
For each reference URL:
1. Fetch its HTML — `curl -sL <url>` (or WebFetch). Grep / scan for:
   - **Smooth-scroll libs:** `lenis`, `locomotive-scroll`, `@studio-freight`, `data-scroll`.
   - **Scroll-interaction hooks:** webflow `data-w-id`, GSAP `ScrollTrigger`, `data-scroll-speed`.
   - **Type:** the `font-family` / Google Fonts links — note if it MIXES a high-contrast display
     serif (Playfair, Cormorant, Fraunces) with a grotesk (Inter, Neue Haas) + italic accents.
   - **Editorial tells:** oversized section numbers (`.01`/`.02`), huge type, full-bleed media,
     generous whitespace, asymmetric/sticky layouts.
2. Write down the 3–5 concrete signatures you'll reproduce. Implement the EQUIVALENTS from the
   project's tool library — never copy assets or proprietary code.

## Step 2 — Smooth scroll with Lenis (the flow engine)
```bash
npm i lenis
```
Mount once at the root (a client `<SmoothScroll/>` in `layout.tsx`):
- `import Lenis from "lenis"` (default import).
- Create `new Lenis({ duration: ~1.1, smoothWheel: true, easing })`; drive it with ONE
  `requestAnimationFrame` loop calling `lenis.raf(time)`.
- **Disable entirely under `prefers-reduced-motion`** (return early, render nothing).
- Route in-page anchors through it: intercept `a[href^="#"]` clicks →
  `lenis.scrollTo(target, { offset: -88 })` (offset clears a fixed nav), else links hard-jump.
- Add the Lenis CSS or it fights native smooth scroll:
  ```css
  html.lenis, html.lenis body { height: auto; }
  .lenis.lenis-smooth { scroll-behavior: auto !important; }
  .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
  ```
- Coexists with framer-motion `useScroll` (reads window scroll, which Lenis drives).

(Keep this in one root client component, e.g. `smooth-scroll.tsx`.)

## Step 3 — Scroll-triggered reveals (calm, once, reduced-motion aware)
A shared primitive so every section reveals identically (slow rise + fade, never bouncy):
- `Reveal` (single element) + `RevealGroup` (staggers children).
- Config that read as "premium": `opacity 0→1`, `y 24→0`, `duration 0.6`, ease `[0.16,1,0.3,1]`,
  `whileInView` with `viewport={{ once: true, amount: 0.3 }}`.
- **Reduced motion:** render the final state with no offset (`initial={reduce ? false : "hidden"}`).

(Implement as a shared `reveal.tsx` primitive so every section reveals identically.)

## Step 4 — Editorial signatures
- **Oversized section numerals** — a large muted display-serif `.01 / .02` labelling each
  section in page order; make it REPLACE the small uppercase eyebrow (one or the other, never
  both, to avoid eyebrow proliferation). Ref: `section-index.tsx`.
- **Dramatic font MIX** — pair a high-contrast display serif (Playfair Display, italics enabled)
  with a grotesk body (Inter) + small serif accents (Fraunces). The signature move:
  **an italic-serif accent WORD inside a sans headline** ("one step *away*", "Less to *carry*").
  Load via `next/font/google` as CSS vars on `<html>`; map to `font-display`/`font-sans`/`font-serif`.
  (Note: some anti-slop taste skills ban mixing families for emphasis — this is a deliberate
  editorial signature; treat it as an explicit override when the owner wants it.)
- **Full-bleed cinematic imagery** — real photos (see `curated-stock-backgrounds`), dark scrim
  for legible copy, slow Ken Burns push (`@keyframes` scale+translate) + crossfade for motion
  without a video. Asymmetric + sticky layouts (sticky headline, scrolling rail) read editorial.

## Step 5 — Verify the flow renders (both themes + mobile)
Screenshot the running app with headless Chromium (see `headless-screenshot-verify`): one
context per theme, plus a 390px mobile context asserting no horizontal overflow
(`documentElement.scrollWidth <= innerWidth`) — scroll-in transforms that enter on the X axis
are a common mobile-overflow cause; enter on Y instead. The owner trusts screenshots, not builds.

## Gotchas
- `next start` serves the build snapshot from startup — rebuild + restart (on a fresh port) to
  screenshot new flow changes. Don't `pkill -f "next start"` (it self-kills your shell).
- `--no-save` dev installs (playwright/sharp) get pruned by any later `npm i` — reinstall before use.
- On REPEAT rejection, change the section's FORMAT/ANGLE (or its copy), not just its motion/styling.
