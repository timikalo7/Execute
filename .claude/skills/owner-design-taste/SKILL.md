---
name: owner-design-taste
description: >
  The owner's web-design taste law. Load this whenever building or restyling any website, landing page,
  marketing site, or UI — especially heroes, navigation/menus, section layouts, animations, palettes, or
  type. Triggers: "redesign", "landing page", "make it custom", "looks generic/slop", "build the site",
  any front-end visual work. Prevents shipping the generic editorial template the owner rejects.
---

# Owner design taste — the durable law

The owner has rejected generic "AI slop" twice (an example app-web, an example marketing site). Internalise this before writing UI.

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
- **Bento grids are good design — reach for them (owner directive).** Varied-size cells in a tidy grid,
  each cell one idea (a feature, a product, a stat, a lifestyle shot). Great for feature/product/overview
  sections in general, not just e-commerce. Pair with a subtle **dot-grid / structural grid** background
  for the premium engineered feel; align everything to the grid.

## Hero archetypes — pick one deliberately per brief (don't default)
A hero is a *type*, not a layout accident. Name the archetype in the plan, then build it.
- **Cinematic product** — full-bleed dark stage, one hero object lit like a film still, atmospheric
  depth, minimal copy. For a single flagship product/device.
- **Gallery** — big editorial headline over a row/arc of images (often subtly curved or scroll-driven).
  For studios, portfolios, anything whose proof is a body of work.
- **Bento** — the hero *is* a bento grid: headline tile + product tile + two supporting tiles. Says a
  lot fast without a wall of text. For multi-benefit products.
- **Masthead** — tiny corner text, enormous whitespace, the restraint IS the statement. For fashion,
  editorial, luxury, high-confidence brands.
- **Split / editorial** — type one side, image the other, asymmetric weighting (never a bland 50/50).
- Whichever is chosen: full viewport height, one clear focal point, one primary action.

## Premium interaction menu — the "one mechanic per section" candidates
Reach for these when a section needs a signature moment (build with the §4.2 libraries: React Bits /
Aceternity for effects, GSAP + ScrollTrigger for scroll timelines and pinning, Framer Motion for
component reveals, three.js/Vanta only where the concept needs it).
- **Object reveal on hover** — the subject/detail appears or resolves under the cursor.
- **Portal transition** — the camera/viewport travels *through* an element into the next scene.
- **3D product spin** — a real 3D object the user can rotate, or that turns on scroll.
- **Particle transformation** — particles assemble into (or dissolve out of) an object or word.
- **Space / zoom transition** — one section becomes the next by scale rather than a cut.
- **3D gallery** — cards arranged in depth, navigated by drag or scroll.
- **Breaking the fourth wall** — an element escapes its frame/grid and overlaps neighbouring sections.
- **Text masked behind the subject** — the headline sits *behind* the photographed subject, with the
  subject's silhouette cut out in front of it. Instantly reads as art-directed rather than templated;
  use a cut-out PNG/WebP over the type, and always verify contrast + the mobile crop in `visual-qa`.
- **Draw-to-continue** — the visitor *traces a shape* with the cursor (a zero, a letter, the brand
  mark) and the hero resolves as they draw it. Strongest signature on this list because it cannot be
  screenshotted or copied from a template — the page does not move until a person does. Rules: it must
  never be the ONLY way forward (keyboard users and touch cannot trace; give a skip/continue that is
  visible from the start, not revealed after a timeout), and the drawn path is decoration — never put
  real content behind completing it.
- **Cursor-aware objects** — an object that continuously *deforms or turns toward* the pointer
  (inflated 3D letters, soft-body type, a mark that leans). Distinct from "object reveal on hover":
  nothing is being revealed, the object is simply aware. Keep it to ONE object; a page where
  everything reacts feels like a bug. Reduced-motion gets the object at rest, not removed.
Rules: **one** signature mechanic per section, never two competing; every one respects
`prefers-reduced-motion` (`safe-scroll-reveal`); and animate transform/opacity only
(`memory/frontend-and-ops-quality.md`).

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

### Hero mechanics seen in the wild (reel `DbcnrnVSiMI`, "Hero Section Edition")

**Status matters here and is stated per site, because none of these could be OPENED from this
container** — the environment's network policy resets the connection (the agent proxy logged a
policy denial). The design law's rule is *open + screenshot before designing*; that was NOT possible,
so these are recorded as leads to open on the owner's own machine, not as references that have been
studied.

- **`illoca.com`** — *interactive storytelling* hero: an illustrated blue/cream scene the visitor
  moves through. **Verified real from source** (105 KB, "illoca – AI tools for 2D drafting and 3D
  modeling"), and it runs **Lenis + WebGL + canvas** — the same smooth-scroll library this repo
  already uses. Never seen running.
- **`benorth.studio`** — *cursor-aware objects*: inflated 3D balloon letters that deform toward the
  pointer. **UNREACHABLE from here** (connection reset). Not verified at all beyond the reel's frames.
- **the draw-a-zero site** — *breaking the fourth wall*: "DRAW A ZERO" traced with the cursor to
  reveal the hero. **NOT IDENTIFIED.** The reel's browser tab reads "Zero — Human Infrastructure";
  `zero.tech` is a different company ("built to protect your inalienable digital rights") and
  `zero.build` was refused by the proxy. Do not guess at the URL.

### Galleries — for FINDING references, not for copying
- **mesh3d.gallery** — curated showcase of interactive Three.js / WebGL sites, browsable by tag, plus a
  **Makers** index of the studios producing them (Unseen Studio, Lusion, PeachWeb…). Free to browse,
  free to submit, no paywall (checked 2026-08-27). Use it the same way as every entry above: **open the
  site and screenshot it**, then design — a gallery thumbnail is not a reference, the running site is.
- **unitedcarriers.com** — **opened and measured 2026-08-28**, after sitting here since 2026-08-27 as a
  description taken from the reel that surfaced it. The line directly above says a gallery thumbnail is
  not a reference and the running site is; recording this entry without going to look was that rule
  being broken two lines after writing it. What the site actually is:
  - **A Webflow site**, not a bespoke build — `cdn.prod.website-files.com/…/webflow.*.js`, plus jQuery
    3.5.1 and Finsweet Attributes. That matters more than it sounds: the reference everyone would
    assume is a from-scratch studio build is a page builder with a custom layer bolted on.
  - **The custom layer is one 52 KB `main.js` on Netlify**, carrying **Barba** (page transitions),
    **Lenis** (smooth scroll), **GSAP** and **Swiper**. That is the entire "elaborate scene work".
  - **Exactly one video** — a sea-wave loop, shipped as both `.mp4` and `.webm`, with a poster image
    set as a CSS background behind it. Poster first, one clip, two codecs. The reel's "very little
    video" claim **holds**, and this is the pattern worth copying.
  - **The weight is not the motion.** Its CSS is **438 KB** and its HTML **410 KB**; the custom
    animation layer is 52 KB, roughly an eighth of the stylesheet. So the tradeoff to actually learn
    here is the opposite of the obvious one: the interesting motion was cheap, and the page builder
    was expensive.
  **SEEN 2026-08-28**, after the owner said it opened fine for them. Chromium here still cannot open
  an external connection directly, but `browser-drive/external-site.mjs` routes the page's requests
  through Node and the site renders for real — 404 requests, 0 failed, a **28,229px** page recorded
  running. What it actually does, now watched rather than inferred:
  - **A scroll-velocity readout.** A `00 KM/H` telemetry label pinned top-left that responds to how
    fast you scroll. It costs almost nothing and it makes the page feel instrumented — the single
    most stealable idea on the site.
  - **Cut-out freight on flat white.** Trucks, containers and a reach stacker as background-free
    product shots on a plain ground, assembling and moving as you scroll. No photographic
    environment anywhere, which is why one video was enough for the whole page.
  - **A subject straddling the light/dark seam.** The truck sits across the boundary where the white
    section meets the black one, so the section change reads as one continuous scene rather than as
    two stacked blocks.
  - **A giant ghost word cropped by both edges** behind the vehicle — oversized backdrop typography
    at very low contrast, deliberately unreadable as text and working purely as texture and scale.
  - **Two-tone headlines.** The second line drops to roughly 40% opacity instead of changing weight
    or size. Emphasis by tonal step, which is quieter and holds up better at large sizes.
  - **Mono uppercase micro-labels** on pill buttons, against a heavy condensed display face.
  **Still not measured:** Core Web Vitals and reduced-motion behaviour (the recording ran under
  default motion), and what the two `<canvas>` elements do — three.js appears in neither the script
  list nor `main.js`, so do not assume WebGL.

**Portfolio mechanics worth having, from `DbA3q18Sp5u` (2026-08).** The reel named no tools at all —
it is a sweep of *techniques*, so it belongs here rather than in the tool library: carousels with
**sound effects** on interaction, carousels with hover-driven media swaps, scroll-driven section
animation, and **interactive 3D models with a CTA attached to the object** rather than beside it.
That last one is the only genuinely uncommon idea in it, and it is the one ThreeUI (execute.md §4.2)
now exists to serve. Sound on interaction stays opt-in and muted by default — audio that plays
unbidden is a bounce, not a delight.

**The standing caveat on everything in this section that moves.** Three.js/WebGL references are the
easiest place to talk yourself past the law: `CLAUDE.md` allows three.js only *"where the concept needs
it"*, and the Vanta.js rule applies to all of it — **check Core Web Vitals and give reduced-motion a
static fallback**. A site being beautiful in a gallery says nothing about what it scores, and the
gallery does not publish that number. Admire it, then measure your own.

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
