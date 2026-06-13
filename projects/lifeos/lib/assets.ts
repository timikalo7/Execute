// Brand imagery slots. Drop generated art (e.g. Higgsfield) into /public and
// point these at it. Until then they stay null and components render a tasteful
// ink fallback — the layout holds either way.
//
// Recommended hero art direction (matches the "ink & ember" command deck):
//   "A founder-athlete at a desk in a still-dark room before dawn, single warm
//    desk lamp (amber), cool blue pre-dawn window light, calm and cinematic,
//    shallow depth of field, muted warm-neutral grade, no text, editorial."
//
// Keep assets ≤ ~10MB, 16:9 or 16:7 for the hero strip.

export const HERO_IMAGE: string | null = null; // e.g. "/hero.jpg"
export const CTA_IMAGE: string | null = null; // e.g. "/cta.jpg"
