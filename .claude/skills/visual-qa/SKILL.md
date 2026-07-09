---
name: visual-qa
version: 1.0.0
description: >
  Front-end visual QA you actually run, not eyeball. Load this whenever you build or change a
  web UI — a new section/component, a hero, nav, animation, image, or layout — before saying it
  works or committing. Drives the built+served site through headless Chromium across widths,
  AUTO-SCROLLS every pinned/tall scene to multiple positions (so text-over-art overlaps and
  nav-contrast flips can't hide between stops), runs axe-core for WCAG AA, checks horizontal
  overflow and console errors, and forces a per-photo human look. Pairs with owner-design-taste.
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# visual-qa — run the checks, then actually look

Eyeballing one screenshot at one width misses the bugs that get caught in review: a dark section
that doesn't flip the nav white, body text colliding with an SVG only at one scroll position, a
portrait cropped to "just the head", a 6px overflow on iPhone SE. This skill makes those checks
mechanical so they stop slipping.

## When to run
- After ANY new interactive/visual component or scene.
- After changing a hero, masthead, nav, animation, image, or section layout.
- Before you claim a UI works, and before you commit front-end changes.

## How to run

### The one command (use this — it's why the gate "didn't work" before)
```bash
bash .claude/skills/visual-qa/run.sh projects/example-marketing-site
```
`run.sh` does the whole gate so setup can't be the failure point: builds the project → clears the
stray `.next` symlink that breaks Turbopack → serves the static export (`out/`) on `:8791` →
**auto-detects the routes from `out/`** → points the sweep at Playwright's browsers + axe-core → runs
the sweep → tears the server down → **exits with the sweep's code** (non-zero fails the build).
`project-dir` defaults to the current dir. Pass `--widths 390 768 1440` / `--routes / /about …` to
override the defaults. This is the invocation to reach for every time; the manual steps below are only
for debugging the wrapper.

`run.sh` also owns its environment so the sweep can't measure the wrong thing (all learned the hard
way): it pidfile-kills any server a crashed previous run left behind, refuses a busy port (walks up
to a free one — an orphaned server once made a example-web sweep silently measure the an example marketing site
site, every route 404), aborts loudly if the server never answers, and time-boxes every stage
(`VQA_BUILD_TIMEOUT` 600s / `VQA_TIMEOUT` 480s via `timeout(1)`) so a hang can't wedge the session
or leave orphans. If you ever manage the server yourself: **kill by pidfile or port
(`fuser -k PORT/tcp`), never `pkill -f <pattern>`** — a pattern that appears in your own command
line kills your own shell (exit 144), and the `[s]tart` trick doesn't save you when the literal
string also appears elsewhere in the same command.

### Turbopack build flake → the `--no-build` flow
On a slow FS, `next build` occasionally emits a chunk graph referencing a chunk that doesn't exist
(routes 500 on a `/_next/static/chunks/*.js`; a clean rebuild usually cures it). When that bites:
build → probe **every** route for a <400 response (playwright/curl) → rebuild if dirty → then sweep
the exact artifact you verified with `run.sh <dir> --no-build`. Never rebuild between verifying and
sweeping. (The `.next`-relocation symlink is a dev-server-only trick — it breaks Turbopack builds;
run.sh already handles the leftover link.)

### Manual (only if you're debugging the wrapper)
1. Build + serve the static output (don't QA the dev server):
   ```bash
   npm run build && (cd out && python3 -m http.server 8099 &)   # or the project's serve
   ```
2. Run the sweep (script lives next to this file):
   ```bash
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
   node .claude/skills/visual-qa/sweep.mjs --base http://localhost:8099 --out /tmp/vqa \
     --routes / /about /connect /give /plan-your-visit /what-to-expect /expressions /join-the-team /rcf-st-andrews \
     --widths 390 768 1440
   ```
   Playwright is at `/opt/node22/lib/node_modules/playwright`; axe-core is auto-found at
   `node_modules/axe-core/axe.min.js`. It writes per-scene screenshots + `report.json` to `--out`.
   Routes run **concurrently** (a page pool; `VQA_CONCURRENCY`, default 4) and the per-route waits are
   hydration-gated, so a 9-route × 2-width sweep is ~tens of seconds, not tens of minutes. Lower
   `VQA_CONCURRENCY` on a constrained machine. Pass `--src <dir>` to enable the reduced-motion source
   lint.
3. The exit code fails on overflow / console errors / serious-or-critical axe violations — but the
   **screenshots are the deliverable. Open them and look**, especially every scene-* frame (the
   auto-scrolled positions) and every photo: is the title readable, is the nav legible over it, is
   anything cropped or overlapping?

## The non-negotiables (from owner-design-taste, enforced here — exit code fails on each)
- `document.documentElement.scrollWidth === window.innerWidth` on every route × width.
- Zero console errors / failed requests.
- Zero serious/critical WCAG2-AA violations (contrast, alt text, landmarks, heading order). Never
  self-report a11y — this runs the real scanner.
- **Section seams are measured, not eyeballed.** A "heavy" section (full-bleed photo / dark bg /
  `data-nav-dark`) followed by a light section whose first heading sits closer than ~44px (desktop) /
  ~28px (mobile) to the seam is a FAIL (`SEAM="…"@Npx` in the output). This is the bug that recurred
  (join-the-team "Ready to serve?", plan-your-visit "Contact us") — it no longer ships silently.
- **No repeated full-bleed band image across routes.** The same full-width photo used as a band on
  2+ pages is a FAIL (`REPEATED … → /a, /b`). Catches the "every page ends on the same abstract
  image" miss. Give each page its own band. **Intentional** shared bands are declared in a
  `.visual-qa.json` at the project root (`{"allowRepeatBands":["about-champions"]}`, matched by
  substring) or via `--allow-repeat <substr…>`; declared repeats are listed but don't fail. Declare
  sparingly — the default is unique-per-route.
- **No motion `initial`/`hidden` branched on reduced-motion.** A source scan fails on
  `initial={{…reduce…}}` / `hidden: {…reduce…}` (`REDUCED-MOTION HYDRATION RISK`). Branching the
  *initial* state on `useReducedMotion()` makes the SSR HTML differ from a reduced-motion client and
  trips a hydration mismatch — and that mismatch is a **dev-only** console warning the production
  build the sweep serves never logs, so only a source scan catches it. Keep the initial deterministic;
  let reduced-motion only zero the transition. (Shipped once on Reveal/MaskReveal/ScaleInImage.)
- Every photo: legible title/eyebrow, legible nav/logo over it, no bad crop at 390/768/1440.

## axe realities that produce non-obvious fails
- **`color-contrast` applies to `aria-hidden` text too** — it's a visual rule. Decorative pale text
  must genuinely meet 3:1 (large) / 4.5:1; hiding it from AT changes nothing.
- **`aria-label` is prohibited on plain `<span>`/`<div>`** (`aria-prohibited-attr`) — give the
  element a role or drop the label.
- **One brand colour, both directions:** a colour used as text-on-white AND as a bg under white text
  must clear ≥4.5:1 against white once (same pair measured both ways).
- **Entrance animations must finish before the axe settle (2400ms)** — a mid-fade colour reads as a
  real contrast fail. Keep hero entrance delay chains ≤ ~1.5s total (better UX anyway).
- **Silent SVG death:** a path built as `M-${expr}` becomes `M--4` when the expr goes negative;
  Chromium drops the whole path with no console error. Compute signed numbers (`M${i*32 - 380}`).

## New-component risk checklist (run your eyes down this for EVERY component you add)
These are the questions that, unasked, produced real bugs on an example marketing site:
1. **Is it dark?** If the section/scene has a dark background (image or `bg-ink`), the nav must read
   over it. With luminance auto-detection it should "just work" — verify it does; otherwise add
   `data-nav-dark`. (Missed once → invisible logo over the Bible section.)
2. **Does any text overlap moving/absolute art at EVERY scroll position?** Scrub a pinned scene end
   to end, not just the start/end. (Missed once → CTA text collided with the descending dove.)
3. **Overflow:** does it push past the viewport at 390? Constrain insets inside `overflow-hidden`.
4. **Image aspect:** hero/masthead photos must be landscape; never force a portrait into a wide
   full-bleed banner (it bands to "just the head"). Check the crop at all three widths.
5. **Keyboard + focus + aria:** interactive? It needs a focus state, an accessible name, and to be
   reachable by tab. Icon-only controls need `aria-label`.
6. **Reduced motion:** scroll-/auto-animation should degrade gracefully under
   `prefers-reduced-motion: reduce`.
7. **Contrast:** text over the image/scrim meets AA (the sweep's axe pass confirms).
8. **Section seams / vertical rhythm** — now measured automatically (see non-negotiables). A section
   under a full-bleed/dark one needs its **own top padding** (`pt-24 sm:pt-32`), not just the
   neighbour's bottom. The sweep flags `SEAM="…"@Npx` and fails; still glance at the boundary frame.

## Notes
- This is general (any web project). The an example marketing site route list above is the proven invocation.
- It does not replace the `qa` agent (logic/unit/e2e) — it's the front-end *eyes* layer on top.
