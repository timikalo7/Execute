---
name: curated-stock-backgrounds
description: Add real, royalty-free photographic backgrounds to a web/marketing surface with no API key — discover Pexels CDN photos, convert to optimized webp, commit locally. Use when a landing page or marketing surface needs real product/lifestyle photography (preferred over generative imagery), or when the owner wants stock photos that tell a before→after story.
---

# Curated stock backgrounds (keyless, optimized, story-driven)

Real curated stock often beats generative imagery for product/marketing backgrounds: it's on-brief, free, and never garbles text.

## When to reach for this
- Any marketing/landing surface that needs lifestyle or product photography.
- The brief (or the project's `user-profile.md`) prefers real photos over AI-generated.
- You want the images to carry a narrative across the scroll, not just decorate.

## Steps

1. **Plan the story first.** Decide what each image argues before picking any. A strong pattern: before (problem state) → middle (using the product) → after (the win). Name the slots, e.g. `howitworks-scattered`, `features-app`, `cta-promo` / `cta-gym` / `cta-grad`. For CTAs, pair each image with copy tailored to that goal.

2. **Discover photos without a key.** WebFetch a Pexels search page (`https://www.pexels.com/search/<query>/`, url-encode spaces as `%20`) and extract CDN links from the HTML. The CDN serves with NO API key:
   `https://images.pexels.com/photos/<id>/<slug>.jpeg?auto=compress&cs=tinysrgb&w=<width>`
   (Unsplash alternative: `https://images.unsplash.com/...` direct CDN works with a known photo id; the old `source.unsplash.com` random endpoint is dead/503.)

3. **Download** the chosen JPEGs to a temp dir (curl/WebFetch). Pick a width that covers the largest render (e.g. `w=2000` for full-bleed hero).

4. **Convert to webp, commit locally** — don't depend on the CDN at runtime:
   ```bash
   npm i --no-save sharp          # leaves package.json clean
   NODE_PATH="$PWD/node_modules" node /tmp/conv.mjs   # sharp(input).webp({quality:80}).toFile(...)
   ```
   webp q80 typically takes multi-MB PNG/JPEG down to ~30–235KB — a real LCP win. Write to `public/backgrounds/<slot>.webp` (Next.js serves `public/x` at `/x`).

5. **Wire them in** with proper overlay/gradient for text legibility, and tie copy to the matching image at each CTA.

6. **Verify the rendered result** with a screenshot (see the `headless-screenshot-verify` skill) — a green build does not prove the image shows. Make the screenshot the first artifact, not the last resort.

## Gotchas
- Generative gen (e.g. Higgsfield z_image) injects garbled title/letter text on dark "premium poster" prompts and costs credits — prefer curated stock for product backgrounds; reserve generative for what stock can't cover.
- Always check the photo's license is royalty-free / no-attribution-required for the use.
- When you swap a real photo in, sweep any now-unused image deps.
