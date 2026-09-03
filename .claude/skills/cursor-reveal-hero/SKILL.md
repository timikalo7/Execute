---
name: cursor-reveal-hero
description: Build a hero section where moving the cursor reveals a second, living version of the same subject through a soft mask — dead rock to living ecosystem, day to night, wireframe to finished, before to after. Use when a hero needs one memorable interaction rather than another fade-in, when the brief asks for an "interactive"/"x-ray"/"reveal" hero, or when a static hero image has been called flat. Covers the two-layer mask engine, the touch and reduced-motion fallbacks that decide whether it ships, and the generated-asset pipeline that makes the two layers line up.
---

# Cursor-reveal hero

One image, two states, and a soft disc that follows the pointer. Under the cursor the subject is
alive; everywhere else it is dead. It is the cheapest high-impact hero interaction there is —
**two CSS custom properties and one `radial-gradient` mask** — and almost all of the difficulty is
in the parts that are not the effect: touch, reduced motion, and making the two layers line up.

Source: a filatov.design breakdown (a volcanic rock that grows moss, waterfalls and insects under the
cursor). The effect is generic — the technique is worth far more than that one asset.

## When to reach for this
- A hero that needs **one** thing people remember, and the page has a single strong subject.
- Any honest before/after: renovation, restoration, day/night, satellite/map, wireframe/finished,
  polluted/clean, draft/final.
- A hero image the owner has called flat, static, or "just a picture".

**Do not** reach for it when the revealed layer carries information the page needs to communicate.
A cursor reveal is invisible to a keyboard user, a screen-reader user, and anyone who never happens
to move the mouse across that spot. It is decoration on top of a complete page, never the delivery
mechanism for content.

## The mechanic

Two layers, stacked and pixel-aligned:

| layer | what it is | why |
|---|---|---|
| base | still image — the **dead** state | it is the LCP element; keep it an `<img>` so it loads first |
| alive | short looping **video** — the living state | motion inside the reveal is what sells it; a second still reads as a swap |

The alive layer is painted across the whole hero and then **masked** to a soft disc centred on the
pointer. Nothing moves, resizes or re-renders — the pointer writes two custom properties and the
browser repaints one masked layer.

```css
.reveal-hero { position: relative; --mx: 50%; --my: 45%; --r: 160px; }

.reveal-hero__alive {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
  -webkit-mask-image: radial-gradient(circle var(--r) at var(--mx) var(--my), #000 0 55%, transparent 100%);
          mask-image: radial-gradient(circle var(--r) at var(--mx) var(--my), #000 0 55%, transparent 100%);
}
```

The `0 55%` stop is the whole look. A hard-edged circle (`#000 0 100%`) reads as a magnifying glass
stuck to the cursor; the feathered edge reads as the thing underneath bleeding through.

**A complete, working, verified implementation is in `reference/cursor-reveal.html`** — take the
`<style>` and `<script>` from it rather than retyping this from the snippet above.

## The four things that break it

1. **Writing to `style` on every `pointermove`.** Pointer events fire faster than frames. Batch into
   one `requestAnimationFrame`, and **stop the loop** once the mask has caught up — a rAF that never
   cancels is a permanent battery drain on a page that looks idle.
2. **Easing under `prefers-reduced-motion`.** The reveal follows the user's own hand, which is fine
   at WCAG AA. The *lag* is autonomous motion they did not ask for. Snap instead of easing when
   reduce is set; do not disable the reveal itself.
3. **Touch.** There is no hover on a phone, so the effect is simply absent unless something drives
   it. Park the mask at a designed anchor (`--mx: 50%; --my: 45%`) so the hero has a deliberate
   composition at rest, and let drag move it. Never let a phone see a hero that is 100% dead state
   when the design intent was a glimpse of the living one.
4. **Layers that do not line up.** If the two renders have different silhouettes, camera angle or
   crop, the reveal reads as a crossfade between two pictures instead of an x-ray of one. This is the
   single biggest quality gap and it is an *asset* problem, not a code problem — see below.

Also: `@supports` the mask, and when it is unsupported **show the base only**. Falling through to the
alive layer at full opacity is a different design, not a degraded one.

## Making the two layers line up (the asset half)

Generate the dead state **first**, then generate the living state **from that image**, instructing the
model to keep the silhouette. Do not generate the two independently and hope.

1. **Dead state — image.** Ideogram or Higgsfield (both in the tool library; both credit-gated —
   check balance before a plan depends on them, per `memory/tool-credits.md`). Prompt for a single
   subject on a plain background, even lighting, no drop shadow. Keep the background flat: the hero
   composites over the page.
2. **Living state — image-to-image from the dead one.** Same model, the dead image as reference,
   with the instruction that carries this whole technique: *keep the exact silhouette and camera;
   add <the living detail> only within the existing form.*
3. **Animate the living state — image-to-video.** Higgsfield image-to-video, 3–6 seconds, subtle
   motion only (drifting particles, running water, a shifting insect). Export a seamless loop.
4. **Cut out both** to transparent PNG / WebM with alpha if the hero sits on the page background
   rather than a card.

If credits are short, the whole effect still works with two stills — the alive layer becomes an
`<img>`. It loses maybe a third of the impact and costs nothing.

*(The source used Grok Imagine. That is not in the tool library, so it is not what Execute reaches
for — the library equivalents above do the same job under the tool-selection rule.)*

## Performance and a11y checklist

- The base `<img>` is the LCP element: real `width`/`height`, `fetchpriority="high"`, no lazy-load.
- The video: `muted playsinline loop`, `preload="metadata"`, a `poster` matching the dead state, and
  **paused via `IntersectionObserver` when the hero scrolls out of view**.
- Under `prefers-reduced-motion: reduce`, do not autoplay the video — show a still frame of the
  living state and let the mask still reveal it.
- `aria-hidden="true"` on the alive layer; the base carries the `alt` describing the whole idea
  ("a volcanic rock that reveals a living ecosystem"). One accessible name, not two competing ones.
- Keep `--r` fixed. Animating the radius animates the gradient, which is a fresh mask every frame.

## Verify it, do not admire it

```bash
node .claude/skills/cursor-reveal-hero/reference/verify.mjs
```

It drives a headless browser, moves the pointer, and reads **actual pixels** at the anchor, under the
pointer, and where the reveal came from. Then it re-runs the same checks against a deliberately
broken copy whose mask is pinned to a literal position — the bug a typo in the gradient produces —
and fails the run if those checks still pass. Last measured output:

```
GOOD PAGE — every check must pass
  PASS  at rest, the reveal sits at the designed anchor
        anchor rgb(0,71,171) (want blue), corner rgb(176,0,32) (want red)
  PASS  the reveal moves to the pointer
  PASS  and leaves the place it came from

BROKEN PAGE — mask pinned to a literal position; the tracking checks MUST fail
  fail  the reveal moves to the pointer
        under pointer rgb(176,0,32) (want blue)
  fail  and leaves the place it came from

RESULT: PASS — reveal tracks the pointer, and the check is proven to catch a mask that does not.
```

On a real page this does not replace `visual-qa` — run that too, because the hero is front-end and
the reveal is exactly the kind of thing that hides an overflow or a contrast failure underneath it.
