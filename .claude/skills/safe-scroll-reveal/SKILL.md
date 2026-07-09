---
name: safe-scroll-reveal
description: Reduced-motion + SSR-safe scroll reveal recipe for Framer Motion on Next.js (App Router / static export). Load whenever you add scroll/entrance animations, "fade/slide in on scroll" reveals, mask-rise headings, or handle prefers-reduced-motion on a server-rendered or statically-exported site. Prevents the hydration-mismatch / invisible-text / MotionConfig pitfalls that cost a full motion-system rebuild on an example marketing site.
---

# Safe scroll reveal (Framer Motion + SSR / static export)

Use this for any reveal/entrance animation on a Next.js App-Router or `output: export` site. It avoids the four bugs that forced a 3–4× motion-system rebuild on an example marketing site.

## The traps (why naive reveals break)
1. **Hydration mismatch.** Branching a component's `initial`/`hidden` state on `useReducedMotion()` makes the server HTML (which can't read the OS preference) differ from a reduced-motion client → React hydration mismatch. It's a **DEV-only** warning, so a check on the built `out/` console can't see it.
2. **MotionConfig hides text.** `<MotionConfig reducedMotion="user">` disables transforms for reduced-motion users. Any reveal that *uncovers text via a transform* (mask-rise heading, slide-up) then leaves the text parked off-screen → invisible content. Never rely on it for transform-based reveals.
3. **The hook ignores MotionConfig.** `useReducedMotion()` reads `window.matchMedia('(prefers-reduced-motion: reduce)')` directly. A force-motion flag routed through MotionConfig will never reach hook-based components.
4. **Sideways reveals clip the page.** An `x` reveal needs an overflow guard, but `overflow-hidden` on the wrapper breaks `position: sticky` scroll scenes.

## The pattern (do this)
1. **Make the reveal scroll-linked, not whileInView/timer-based.** Tie progress to the element's own scroll position with `useScroll({ target: ref, offset: [...] })` + `useTransform`. It always reaches the visible target (content can never be stranded), can't be skipped by a fast flick, and plays for everyone — user-driven scroll is WCAG-AA fine (only AAA disallows). So you need **no reduced-motion branch** for these.
2. **Keep `initial` deterministic for any non-scroll-linked variant.** Above-the-fold / first-screen content can't be scroll-linked (it'd render only part-way at first paint) — give it a one-shot `mode: "load"` with a **fixed** `initial`/`animate` (never branched on the OS preference).
3. **Gate only autonomous pointer flourishes** (magnetic CTA, cursor-reveal) on a tiny helper, not MotionConfig:
   ```ts
   // src/lib/motion.ts ("use client")
   export const FORCE_MOTION = process.env.NEXT_PUBLIC_FORCE_MOTION === "1";
   export function motionAllowed() {
     if (FORCE_MOTION) return true;
     if (typeof window === "undefined") return true;
     return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   }
   ```
4. **For `x` (left/right) reveals, put `overflow-x: clip` on a wrapper** (e.g. `<main className="overflow-x-clip">`), NOT `overflow-hidden` — `clip` contains the horizontal travel without disabling sticky scroll scenes.

## Reference implementation
`projects/example-marketing-site/src/components/site/Reveal.tsx` — a `<Reveal>` with `mode: "scroll" | "load"`, `from: "below" | "above" | "left" | "right" | "scale"`, and a per-`index` stagger. Scroll mode binds `style={{ opacity, x, y, scale }}` to `useTransform(scrollYProgress, …)`; load mode uses a deterministic `initial`/`animate`.

## Verify it (don't trust the console)
Run the `visual-qa` sweep. Its **reduced-motion hydration source lint** scans for `initial={{…reduce…}}` / `hidden:{…reduce…}` / `whileInView={{…reduce…}}` and fails the build — that's how you catch trap #1, because the served static build never logs the dev-only warning. The axe pass must scroll through to trigger every reveal and wait out the longest animation before sampling, or a mid-fade reveal reads as a false low-contrast fail.
