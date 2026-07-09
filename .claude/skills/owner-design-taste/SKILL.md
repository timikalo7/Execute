---
name: owner-design-taste
description: >
  The owner's web-design taste law. Load this whenever building or restyling any website, landing page,
  marketing site, or UI — especially heroes, navigation/menus, section layouts, animations, palettes, or
  type. Triggers: "redesign", "landing page", "make it custom", "looks generic/slop", "build the site",
  any front-end visual work. Prevents shipping the generic editorial template the owner rejects.
---

> **EXAMPLE PROFILE — personalize or remove.** This encodes one person's preferences as a starting point. Edit it to your own taste/style, or delete the skill. See README + memory/user-profile.md.


# Owner design taste — the durable law

The owner has rejected generic "AI slop" twice (the example web app, an example marketing site). Internalise this before writing UI.

## The one rule that matters most
**"Custom" = a distinct interactive MECHANIC per section — NOT a repeated editorial template.**
A page of big-serif headings + ghost numerals + framed photos in identical cards is exactly what they reject.
If two sections share a layout, one of them is wrong. Each section earns its place with a *mechanic*.

**Corollary — no dead runs.** Never ship 2+ plain text-on-paper sections in a row. Every section needs
*something* custom: an image/texture background, an interactive mechanic, or a distinct colour/treatment. If a
section is just a heading + link, give it a background (see PhotoBand below). And **delete redundant sections**
— if a section only repeats what the previous one or two already said (e.g. a closing "we saved you a seat" CTA
echoing plan-a-visit + next-steps), cut it.

## Do
- **A mechanic per section.** Proven likes: intro loader that reflects the content; **cursor-reveal hero**
  (image/video revealed behind type by the cursor); **animated-line hamburger → full-screen overlay menu**
  with large staggered link reveals + hover line-fill; **`.01/.02/.03` numbered** sections; **pinned
  scroll-driven scenes** (scrollytelling where the visual tracks the text); a believable in-product
  demo/phone-story; **full-bleed alternating imagery** with huge margins.
- **Neutral base + ONE accent.** Mostly neutral (warm paper/off-white + ink + soft grey); a single accent
  used sparingly. an example marketing site accent = celadon `~#9FB8AD`. Never let one hue dominate everything.
- **Arrow-links over buttons.** Circular or text arrow-links ("Plan your visit →"); aim ≤2 filled buttons.
- **Big↔small type contrast + generous whitespace.** Serif/display headlines + a humanist/grotesque
  sans for body, usually + a **mono for technical eyebrow/label lines**; push display sizes large; let
  space breathe.
- **Choose the typeface per project's vibe — don't default to Inter/Roboto.** Type is a primary lever of
  the custom feel. Pick a pairing that fits the app's mood and source it from **fontsinuse.com**
  (curated real-world type in use), then load via `next/font`. an example marketing site = **Fraunces** (display) +
  **Hanken Grotesk** (body) + **Space Mono** (labels): warm, editorial, premium. Verify through the gate
  (new fonts shift overflow + contrast).
- **Custom cursor sparingly** (1–2 moments), never on every element.
- **Smooth scroll via Lenis**, expose `window.lenis` for QA.

## Don't
- No repeated card-grid template; no "ghost numeral + framed photo" filler.
- **Don't flat-tint a whole photo.** A *localized* gradient scrim for text legibility is fine and expected; a
  flat colour wash over the entire image is not. Avoid repeating the same photo on one page (especially faces);
  a cohesive *abstract texture* may repeat across sections.
- **No icon libraries** except footer **social brand logos** (Phosphor — never **Lucide**, owner dislikes it).
  Everything else = typographic/CSS marks (numerals, rules, CSS hamburger/caret/spinner).
- Never put the owner's *private examples* (their Spotify/SoundCloud, personal plans) on a shipped site.
- No button clusters; no one-hue domination.

## Heroes, images & readability (learned the hard way on an example marketing site)
- **Hero/masthead photos MUST be landscape / wide enough.** Never force a portrait into a full-bleed wide
  banner — it crops "cut off" (heads sliced). Portraits go in contained / side-by-side layouts, not heroes.
  Check the crop at **375 / 768 / 1440** before shipping.
- **Verify readability over every image, every time.** Title/eyebrow/intro need a strong scrim + text-shadow;
  the **nav/logo must stay legible** over a bright photo (add a top legibility scrim). Screenshot and actually
  read it — a washed-out title is a ship-blocker. (Owner repeatedly caught this.)
- **PhotoBand pattern** — a reusable full-bleed `image + scrim + white content` band. Use it to give a
  text-only CTA section an on-palette, readable background in one wrapper (see
  `projects/example-marketing-site/src/components/site/PhotoBand.tsx`).
- **Scrollytelling can carry the real CTAs** — a pinned scene's scroll-revealed text can be the page's actual
  next-step links (e.g. the baptism scene revealing "What to Expect →" / "Join the Team →"), not just decorative copy.

## Image sourcing — the method (no API key needed)
The owner is **photography-forward** and wants real photos with real faces. Don't agonise — source them like
an example app did (its "gym PR" hero was a real Pexels shot pulled by URL):
- **Real stock via direct CDN download.** `WebSearch` a free stock site for the photo, grab its CDN URL, `curl`
  it, optimise to JPEG/WebP, commit. Pexels works keyless: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1600`
  (Pexels/Unsplash licences = free commercial use, no attribution). Prefer **wide** results; warmer tones match the palette better.
- **AI-generate ONLY abstract/texture backgrounds** (no people, no specific places) — e.g. warm clay silk-wave
  gradients. These are fine and perfectly on-palette. (Higgsfield `generate_image`; credits are scarce — reuse.)
- **NEVER AI-generate people for a real org, and never blur/obscure faces to "hide" that they're fake** — just
  use real stock. **Never fabricate a specific real place or person** (e.g. a named venue) — that misleads
  visitors; get the real photo from the owner and scaffold the slot (`/assets/<name>.jpg` via plain `<img>`) until it lands.

## Navigation
- **No glass/frosted bar appearing on scroll.** The nav stays as it loads (transparent); on scroll the
  **icons/links just change colour** — white over a dark hero at the top, ink once scrolled onto light content.
  Add a subtle top scrim only so white nav reads over a photo at the very top.

## Palette note (an example marketing site)
The accent ended up a warm **clay/terracotta** (the `celadon-*` tokens were remapped to clay: `#cf9f74` →
`#a8652f`) over cream paper `#f7f5f0` + ink `#1a1c19` — not the sage `#9FB8AD`. Per-project: sample the accent
from the client's own photography.

## Reference sites (open + screenshot when designing)
- **redstone.software** — text arrow-links, numbered sections, big/small type.
- **carmowood.com**, **db-longbow.webflow.io**, **elyse-residence-dev.webflow.io** — neutral luxury palette,
  full-bleed imagery, spacing, big/small type, flow; animated hamburger w/ line + hover motion (elyse).
- **korowa.vic.edu.au** — hero cursor-reveal.
- **eatnaked.co** — overlay-menu alternative to a plain hamburger; lively, purposeful custom animations + cursor.
- **ESPN longform F1 feature** — intro animation matched to content + pinned scrollytelling.
- **Church work:** `twotencreatives.com/blog/10-of-the-best-church-websites-of-2024` — visitor-first, lean nav,
  strong real diverse photography, service-times + plan-a-visit prominent, daily-Bible homepage feature,
  app-like polish, smooth hover underlines. Also `houseofpraise.ca` — clean, professional, photography-forward
  (full-bleed hero, big bold headlines, generous whitespace, clear plan-a-visit / watch-online + get-involved CTAs).

## Copy you generate (not the client's own words)
Keep verbatim any text taken from the client's real site/brand. But for any copy YOU write
(headlines, scene lines, card blurbs, intros), run it through the **`humanizer` skill** before shipping —
strip the AI tells: significance-inflation ("a testament to", "pivotal"), promo words ("vibrant",
"transformational", "nestled"), superficial `-ing` tails, rule-of-three, negative parallelism ("not just X,
it's Y"), em-dash overuse, and synonym-cycling. Short, plain, specific beats poetic-generic. The owner
will notice generated slop.

## QA cadence the owner expects
`npx tsc --noEmit` + `npm run lint` per change (Next build lags). Playwright screenshots at **375/768/1440**
(browsers at `/opt/pw-browsers`), capture each mechanic (cursor-reveal, overlay menu open, pinned mid-scene)
**and actually look** — read every title over a photo, check no image is cut off, check the nav.
**Verify a11y with real tools, not eyeballs:** inject axe-core (vendored at `node_modules/axe-core/axe.min.js`)
via Playwright across all routes × widths and drive to **0 WCAG2-AA violations**; assert
`document.documentElement.scrollWidth === window.innerWidth` (no horizontal overflow) on every route. Recipe in
`memory/tool-notes.md`. Commit small + push often. Terse working style preferred ("caveman").
