---
name: clone-site
description: The order of operations for cloning a website or app. Load BEFORE starting any clone, redesign-from-reference, or "build it like this site" task. Encodes the sequence that turns a multi-day guess-loop into a short one, learned the expensive way.
---

# clone-site — read it, drive it, then build it

**The lesson this file exists for.** One page took twelve iterations and several days. It was not
hard. The order was wrong: the build started from screenshots and inferred everything else from
pixels, one metric per iteration. The reference's source was reachable the whole time — 419KB of
HTML with the real type scale, weights, colour tokens and motion inventory in it.

**A screenshot tells you what a page looks like. The DOM tells you what it is.** Guessing a type
scale from rendered glyphs takes iterations and lands close; reading `font-size` off the element
takes milliseconds and lands exact.

## The order. Do not skip ahead to step 5.

**1 — Read the system.** `node .claude/skills/browser-drive/design-system-extract.mjs <url> --out reference/design-tokens.json`
Type families, the full scale with its ratios, weights actually in use, text/background/border
colours by frequency, border radii, and every element carrying transform/animation/sticky. Commit it.
This is the spec. Build from it, not from an impression of it.

**2 — Drive it.** `node .claude/skills/browser-drive/interaction-capture.mjs <url> <dir>`
Loading screen, menu open, nav hover, CTA hover, accordion open, field focus. A scroll capture shows
the resting state and nothing else — the owner's rule, and the run that produced it found a whole
full-screen preloader that eleven iterations had never seen. Record what you could not reach as
NOT CHECKED, never as absent.

**3 — Capture the page end to end.** `contact-sheet.mjs` writes slices plus the side-by-side sheet.
Section STRUCTURE comes from these; step 1's section walk is unreliable on nested wrappers.

**4 — Find the motion whose output axis differs from its input.**
`node .claude/skills/visual-qa/axis-motion.mjs --ref-dir <slices>`
Horizontal travel driven by vertical scroll, rotation, scrub, counter-scroll. A still of a
travelling element is identical to a still of a static one, so no single-frame check sees these —
and they are what makes a site feel custom rather than assembled.

**5 — Only now, build.** With the tokens as the spec, the interaction states as the feature list, the
slices as the structure and the motion report as the mechanics.

**6 — Iterate against the gauntlet**, not against an impression: `design-loop.sh` runs ground
sequence, pixel profile, lateral motion and an independent judge. See `memory/gauntlet-loop.md`.

## Rules that cost something to learn

- **A judge is an evaluator, not an oracle.** Check every finding against a named reference slice
  before acting on it. Three relayed findings cost an iteration each — one of them was a sampling
  artifact and one was contradicted by the reference's own stills.
- **Suspect the baseline before the tolerance.** When a check passes something you would reject, ask
  what it is comparing against first.
- **Never budget around a bug in a checker.** Four checker defects each cost an iteration here.
- **Re-read every asset when it changes role or scale.** Seven third-party trademarks were caught on
  one project, several after the asset had already shipped in a different placement.
- **Metrics are the work list, never the goal.** Two iterations moved four numbers the right way and
  the design verdict backwards.
