---
name: document-design
description: >
  Design law for generated documents — reports, proposals, decks, one-pagers, briefs, whitepapers,
  case studies, CVs. Load whenever producing a .docx, .pptx, .pdf, a formatted Markdown deliverable,
  or any document a human will actually read and judge. Stops the default "AI report" look: Calibri,
  bullet soup, clip-art icons, rainbow charts, repeated identical sections. Use alongside the
  docx/pptx/pdf tooling — those handle the file format, this decides how it should look.
---

# Document design — the taste law

Most generated documents look generated: default font, wall of bullets, every section identical, a
rainbow chart, stock icons. The fix is not decoration. It is **typographic discipline, restraint, and
making every section earn its place.**

## The one rule that matters most

**Every section must earn its place with a distinct treatment — not a repeated template.**
If two consecutive sections are both "heading + three bullets", one of them is wrong. Vary the
*form* to match the *content*: a comparison wants a table, a sequence wants numbered steps, a single
number wants to be set large and alone, a quote wants whitespace around it.

**Corollary — no dead runs.** Never ship three plain text-and-bullets pages in a row. And **delete
redundant sections**: if a section only restates the previous one, cut it. Length is not value.

---

## Typography — the primary lever

**Pair three roles.** A document reads as designed when the type does the work:
- **Display/heading** — a serif or a strong grotesque with personality.
- **Body** — a humanist sans or a readable serif, different from the heading.
- **Label/eyebrow/caption** — a mono or small-caps, used for section numbers, table headers, figure
  captions, running heads.

**Never default to Calibri, Arial, Times New Roman, Inter, or Roboto.** Choose per document mood.
Safe, widely-available pairings that don't look generic:

| Mood | Display | Body | Label |
|---|---|---|---|
| Editorial / premium | Playfair Display, Fraunces, Spectral | Source Sans 3, Lato | IBM Plex Mono |
| Corporate but not dull | Libre Franklin, Archivo | Source Serif 4, Charter | IBM Plex Mono |
| Technical / data | IBM Plex Sans | IBM Plex Serif | IBM Plex Mono |
| Warm / human | Fraunces | Hanken Grotesk, Nunito Sans | Space Mono |

If the destination truly only has system fonts: **Georgia** (display/body) + **Verdana** or
**Helvetica/Segoe UI** (the other role) still beats Calibri. Never mix more than **two families plus
one mono**.

**Scale with real contrast.** Weak hierarchy is the most common failure. For a body of 10–11pt:

| Element | Size | Treatment |
|---|---|---|
| Document title | 32–44pt | tight leading (0.95–1.05), can wrap to 2 lines |
| Section heading | 18–24pt | generous space above, little below |
| Sub-heading | 13–14pt | often small-caps or medium weight |
| Body | 10–11pt | leading 1.4–1.5 |
| Caption / label | 8–9pt | mono or small-caps, letter-spaced ~0.08em, muted grey |

Jump sizes decisively — 11pt to 13pt reads as a mistake; 11pt to 22pt reads as design.

**Measure.** Body text at **60–75 characters per line**. On A4/Letter that means real margins
(≥20mm / 0.8in) or a two-column grid. A full-width line of 11pt text across A4 is unreadable and is
the single clearest tell of an unstyled document.

---

## Colour — a budget, not a palette

- **One neutral base + ONE accent.** Base: near-black text (`#1A1A1A`, never pure `#000`) on warm
  off-white (`#FAF9F6`) or plain white. Greys for secondary text (`#6B6B6B`).
- **The accent appears sparingly** — section numerals, one rule, one chart series, key figures. If
  the accent is everywhere it is no longer an accent.
- **Never colour body text.** Emphasis is weight or italic, not colour.
- **No colour-coded rainbow anything.** In charts: one accent for the series that matters, greys for
  the rest. Multi-series needs sequential tints of one hue, not six unrelated colours.
- Colour must never be the *only* carrier of meaning — pair with label, position, or weight
  (accessibility, and it survives mono printing).

---

## Structure and page furniture

- **Number your sections** — `01 / 02 / 03`, set in mono, large and muted, in the margin or above the
  heading. This alone lifts a document out of default.
- **A cover page is a masthead, not a poster.** Title, one-line description, date, author. Vast
  whitespace. Resist filling it. Restraint reads as confidence.
- **Running head + folio** on every interior page: short document title one side, page number the
  other, 8pt mono/small-caps, muted.
- **Anchor the grid.** Pick a margin and a column and hold them on every page. Nothing floats.
- **Start major sections on a fresh page** in anything longer than ~6 pages.
- **Executive summary near the front** for anything over 3 pages: the conclusion first, in prose, not
  bullets. Decision-makers read this and nothing else.

---

## Prose over bullets

Bullet soup is the default failure mode.
- **Bullets are for genuinely parallel, scannable items** — never for an argument. An argument is
  prose: it has connective tissue that bullets destroy.
- **Cap at 5–6 bullets**; more means it should be a table or subsections.
- **Never bullet a single item**, and never nest more than two levels.
- Each bullet **starts with the substantive word** and is grammatically parallel. "Reduced cost by
  30%" not "We were able to achieve a reduction in cost of around 30%."
- **Lead with the answer.** First sentence of every section states the conclusion; the rest supports
  it. Do not build to a reveal.
- Cut hedging ("it is important to note that", "arguably", "in order to"). Cut adverbs. Prefer the
  specific number to the adjective.

---

## Tables, data, figures

- **Tables beat bullets for anything with two dimensions.** Comparisons, options, specs, timelines.
- Table style: **no vertical rules, no full grid, no zebra striping.** A rule under the header, a
  hairline between rows if needed, generous cell padding. Header in mono/small-caps.
- **Numbers right-aligned**, consistent decimal places, tabular figures. Units in the header, not
  repeated in every cell.
- **Every figure gets a caption** that states the takeaway, not the mechanics. "Costs fell 30% after
  the migration" not "Figure 3: Cost chart".
- **Charts:** no 3D, no drop shadows, no pie charts with more than 4 slices, no legend when direct
  labels fit. Axis starts at zero for bars. Gridlines faint or absent.
- **One idea per figure.** If it needs two paragraphs to explain, it is two figures.

---

## Imagery

- **Real photography or nothing.** No clip-art, no stock-people-shaking-hands, no generic 3D
  illustration.
- **No icon sets used as decoration.** A typographic mark, a numeral, or a rule does the job without
  looking like a template. Icons are acceptable only when they carry information (a legend, a status).
- **Never flat-tint a photo.** A localized gradient scrim behind text for legibility is fine; a
  colour wash over the whole image is not.
- **Check text over images actually reads** at final size, in greyscale, and printed. If the title is
  washed out, it ships broken.
- Images sized to the grid, consistent aspect ratios, never stretched, never low-resolution upscaled.

---

## Decks specifically (.pptx)

- **One idea per slide.** If the slide has a title and three sub-points that each need explaining,
  that is four slides.
- **The title states the takeaway**, not the topic. "Churn is concentrated in month 2" beats
  "Churn analysis".
- **Six words per line, six lines maximum** — a deck is not a document. Detail goes in the appendix
  or the notes.
- **No transitions, no animations** beyond an appear/fade. No word-art, no gradients-on-gradients.
- Dark or light — commit to one and hold it across every slide.
- Section dividers: number + two words, full bleed, high contrast.

---

## Before delivering — the check

1. **Squint test.** Blur your eyes: is there a clear focal point per page, or uniform grey mush?
2. **Two-adjacent-sections test.** Do any two consecutive sections look identical? Fix one.
3. **Line-length test.** Is body text 60–75 characters?
4. **Accent audit.** Count accent-colour uses per page. More than ~3? Cut.
5. **Bullet audit.** Any list over 6 items, or any bulleted argument? Convert to table or prose.
6. **Greyscale test.** Print/preview in mono — does everything still parse?
7. **Read the first sentence of each section alone.** Do they form a coherent summary? If not, the
   sections aren't leading with their conclusions.
8. **Cut 10%.** There is always 10% that adds nothing. Remove it.

## Never
Calibri/Arial/Times as a deliberate choice · walls of bullets · clip-art or decorative icon sets ·
rainbow charts and 3D pie charts · full-grid zebra tables · centre-aligned body text · justified text
with hyphenation off (rivers) · more than two type families · colour as the only signal · a cover page
crammed with content · a section that restates the previous one.
