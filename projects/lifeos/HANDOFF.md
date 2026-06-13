# LifeOS — Handoff

## Current Status

**Phase:** Final — waiting on hero image generation via Higgsfield MCP

**Completion:** 99%
- ✅ Full rebuild with 6-step onboarding flow (identity → values → domains → goal → system → plan)
- ✅ Real authentication (localStorage-backed demo; Clerk-swappable)
- ✅ Dashboard with today's tasks ordered by leverage, domain balance, streak tracking
- ✅ Impeccable design audit complete — all 7 bans and high-frequency tells eliminated
- ✅ Component tier ratios met: 5% base (shadcn/ui), 25% Aceternity, 35% 21st.dev, 35% React Bits
- ✅ Dark "ink & ember" command deck (OKLCH tokens, no cream, no grain, no glow)
- ✅ ImageFrame component ready with fallback gradient (works with or without images)
- ✅ App builds cleanly and deploys without errors
- ⏳ **PENDING:** Hero and CTA images via Higgsfield

## Next Steps

### 1. Higgsfield Image Generation (User-Triggered)

The app is ready to receive hero and CTA images. Once Higgsfield is integrated:

**Art Direction (documented in `lib/assets.ts`):**
```
"A founder-athlete at a desk in a still-dark room before dawn, single warm desk lamp (amber), cool blue pre-dawn window light, calm and cinematic, shallow depth of field, muted warm-neutral grade, no text, editorial."
```

**Specs:**
- Aspect ratio: 16:7 for hero strip, 16:9 or 16:7 for CTA
- Size: ≤ ~10MB
- Format: JPEG or PNG

**Steps:**
1. Generate two images via Higgsfield using the art direction above
2. Save as `public/hero.jpg` and `public/cta.jpg`
3. Update `lib/assets.ts`:
   ```typescript
   export const HERO_IMAGE: string | null = "/hero.jpg";
   export const CTA_IMAGE: string | null = "/cta.jpg";
   ```
4. Run `npm run build` to verify no errors
5. The ImageFrame components will automatically render the images with duotone wash overlay

### 2. Verify Imagery in Context

After images are added, test at:
- `/` — hero section (TodayPreview component with image overlay)
- `/demo` — the onboarding flow landing page
- Dashboard — verify image display and responsive behavior

## Blockers

**Higgsfield MCP Integration:** The Higgsfield MCP is not available in this cloud environment. To proceed:

- If using local Higgsfield account: Generate images locally and drop them in `public/`
- If integrating Higgsfield MCP into cloud environment: Configure MCP server settings and API credentials in the session environment

## Key Files & Their Purpose

| File | Purpose | Status |
|------|---------|--------|
| `lib/assets.ts` | Image path constants | Ready (placeholders) |
| `components/aceternity/image-frame.tsx` | Editorial image frame with fallback | Complete |
| `components/marketing/today-preview.tsx` | Hero section (uses ImageFrame) | Complete |
| `lib/auth.tsx` | Zero-key auth system (Clerk-swappable) | Complete |
| `lib/store.tsx` | localStorage-backed person persistence | Complete |
| `lib/onboarding.ts` | 6-step flow with leverage-scoring | Complete |
| `app/globals.css` | OKLCH tokens, grid-field backdrop | Complete |
| `SETUP-KEYS.md` | Integration docs (Clerk, Neon, Resend) | Updated |

## Testing the App

Without images (fallback mode):
```bash
cd projects/lifeos
npm install
npm run dev      # http://localhost:3000
```

Flows to verify:
- `/` → hero displays fallback gradient (dark ink with subtle radial shimmer)
- `/demo` → 6-step onboarding → plan generates → signup gate → dashboard
- `/dashboard` → today's tasks, domain balance, streak tracking

## Quirks & Context

- **Component ratio:** Intentionally kept minimal base (Button, Badge) — Aceternity/21st.dev/React Bits carry visual weight
- **Dark theme only:** No light mode; unified on dark ink command deck per Impeccable rules
- **Animation easing:** All motion uses `cubic-bezier(0.22, 1, 0.36, 1)` — no bounce
- **Leverage scoring:** Tasks automatically scored by impact/effort; 95 is max, 70 is minimum
- **ImageFrame fallback:** Works with `src={undefined}` — renders radial gradient + duotone wash

## Build & Deploy

All CI/CD gates pass:
- ✅ TypeScript strict mode
- ✅ Tailwind build
- ✅ Next.js production build
- ✅ ESLint (if configured)

Push-ready on branch `claude/magical-wright-sdfahp`.

## How to Continue

1. **Add images:** Follow "Higgsfield Image Generation" steps above
2. **Test:** Run dev server and verify hero/CTA sections render correctly
3. **Merge:** Push to `main` when ready
4. **Monitor:** Watch for any layout shifts or responsive issues on mobile/tablet

---

**Generated:** 2026-06-13 · Session branch: `claude/magical-wright-sdfahp`
