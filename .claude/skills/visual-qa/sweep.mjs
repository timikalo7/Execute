#!/usr/bin/env node
/**
 * visual-qa sweep — drive a built, served site through headless Chromium and produce the
 * evidence a human (you) must then actually look at. Catches the bugs eyeballing misses:
 * horizontal overflow, console errors, WCAG contrast/alt/landmark fails, and — crucially —
 * it auto-scrolls every tall/pinned scene to several positions so text-over-art overlaps and
 * nav-contrast flips can't hide between scroll stops.
 *
 * Usage:
 *   node sweep.mjs --base http://localhost:8099 --out /tmp/vqa \
 *     --routes / /about /give --widths 390 768 1440
 *
 * Defaults: base http://localhost:8099, widths 390/768/1440, routes from --routes or "/".
 * Env: PLAYWRIGHT_BROWSERS_PATH (browsers), AXE (path to axe.min.js; auto-detected in node_modules),
 *      VQA_PIXEL_TOLERANCE (per-channel noise tolerance for the baseline diff, default 12).
 *
 * Baseline regression flags:
 *   --baseline-dir <dir>            where baselines live (default <cwd>/.visual-baselines)
 *   --regression-threshold <pct>    diff % above which a shot is reported as a regression (default 1)
 *   --fail-on-regression            make a regression exit non-zero (default: report loudly, don't fail)
 *   --update-baselines              re-accept the current screenshots as the new baselines
 *
 * Exit code is non-zero if any route has overflow, console errors, or serious/critical axe
 * violations — so it can gate a commit. But the screenshots are the point: open them.
 */
import fs from "node:fs";
import path from "node:path";
import { comparePNG, normalizePNG } from "./pixel-diff.mjs";

// Resolve Playwright whether it's local or in the shared runtime (ESM ignores NODE_PATH).
const pw = await import("playwright").catch(() =>
  import("/opt/node22/lib/node_modules/playwright/index.mjs"),
);
const { chromium } = pw;

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const vals = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith("--"); j++)
    vals.push(process.argv[j]);
  return vals.length ? vals : def;
};

const has = (flag) => process.argv.includes(flag);

const base = (arg("--base", ["http://localhost:8099"]))[0];
const out = (arg("--out", ["/tmp/visual-qa"]))[0];
const routes = arg("--routes", ["/"]);
const widths = arg("--widths", ["390", "768", "1440"]).map(Number);

// ---- baseline screenshot regression -----------------------------------------------------------
// First run establishes baselines (never fails). Later runs diff against them. A regression is
// reported LOUDLY but does not fail the run by default: intentional redesigns legitimately change
// pixels, and a gate that cries wolf on every deliberate change gets bypassed, which is worse than
// no gate (agent-graph-engineering §5, "never weaken a gate"). `--fail-on-regression` opts in to a
// hard failure; `--update-baselines` is how a deliberate redesign is blessed.
// A comparison that CANNOT be made (unreadable/undecodable baseline, unwritable dir) is a broken
// checker, not a pass — that always fails the run.
const baselineDir = path.resolve((arg("--baseline-dir", [".visual-baselines"]))[0]);
const regressionThreshold = Number((arg("--regression-threshold", ["1"]))[0]); // percent of pixels
const failOnRegression = has("--fail-on-regression");
const updateBaselines = has("--update-baselines");
const pixelTolerance = Number(process.env.VQA_PIXEL_TOLERANCE || 12);
// Baselines are FULL-PAGE shots downscaled to this width before storing/comparing: full-page is
// what catches "a shared component broke a section below the fold" (a viewport-only baseline sees
// almost nothing but the hero), and the downscale keeps the committed bytes sane while averaging
// away subpixel antialiasing noise.
const baselineWidth = Number((arg("--baseline-width", ["480"]))[0]);
const baselineRows = [];

function checkBaseline(name, shotPath) {
  const basePath = path.join(baselineDir, `${name}.png`);
  const rel = (p) => p; // absolute — a human/agent can open it straight from the log
  const row = { name, baseline: rel(basePath) };
  baselineRows.push(row);
  try {
    fs.mkdirSync(baselineDir, { recursive: true });
    // generated comparison output is OUTPUT, not source — baselines are committed, these aren't.
    const gi = path.join(baselineDir, ".gitignore");
    if (!fs.existsSync(gi))
      fs.writeFileSync(gi, "# visual-qa comparison output — generated, not source\n*.diff.png\n*.current.png\n");

    const shot = normalizePNG(fs.readFileSync(shotPath), baselineWidth);
    const existed = fs.existsSync(basePath);
    if (!existed || updateBaselines) {
      fs.writeFileSync(basePath, shot);
      row.status = existed ? "updated" : "created";
      for (const s of [".diff.png", ".current.png"])
        fs.rmSync(basePath.replace(/\.png$/, s), { force: true });
      return;
    }

    let cmp;
    try {
      cmp = comparePNG(fs.readFileSync(basePath), shot, { tolerance: pixelTolerance });
    } catch (e) {
      if (!e.dimensionMismatch) throw e;
      // a size change IS a change — report it as a regression, never swallow it
      const cur = basePath.replace(/\.png$/, ".current.png");
      fs.writeFileSync(cur, shot);
      row.status = "regression";
      row.pct = 100;
      row.detail = e.message;
      row.current = rel(cur);
      return;
    }

    row.pct = (cmp.ratio * 100);
    row.diffPixels = cmp.diffPixels;
    if (row.pct > regressionThreshold) {
      row.status = "regression";
      const diffPath = basePath.replace(/\.png$/, ".diff.png");
      const curPath = basePath.replace(/\.png$/, ".current.png");
      fs.writeFileSync(diffPath, cmp.diff);
      fs.writeFileSync(curPath, shot);
      row.diff = rel(diffPath);
      row.current = rel(curPath);
    } else {
      row.status = cmp.diffPixels === 0 ? "unchanged" : "changed";
      for (const s of [".diff.png", ".current.png"])
        fs.rmSync(basePath.replace(/\.png$/, s), { force: true });
    }
  } catch (e) {
    row.status = "error";
    row.detail = e.message;
  }
}

// find vendored axe-core
const axeCandidates = [
  process.env.AXE,
  "node_modules/axe-core/axe.min.js",
  path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js"),
].filter(Boolean);
const axePath = axeCandidates.find((p) => fs.existsSync(p));
const axeSrc = axePath ? fs.readFileSync(axePath, "utf8") : null;

fs.mkdirSync(out, { recursive: true });
const rows = [];
let failed = false;
// cross-route accumulator: which full-bleed band images appear on which routes (catches the
// "every page ends on the same abstract image" repetition that overflow/a11y never see).
const bandUsage = new Map(); // src -> Set(routes)

// Routes run concurrently within each width (a small page pool) instead of one-at-a-time — the bulk
// of the wall-clock was idle waits (hydration settle, per-scene pauses) that overlap cleanly. Tune
// with VQA_CONCURRENCY (default 4; lower it on a constrained machine).
const CONCURRENCY = Number(process.env.VQA_CONCURRENCY || 4);

/**
 * Wait until layout stops moving: two consecutive identical geometry samples, and no element still
 * sitting on a non-identity transform. Capped, and a timeout is NOT a failure — a page with a
 * genuinely perpetual animation (a marquee, an ambient drift) never stabilises, and the right
 * behaviour there is to measure it anyway rather than to fail the build over a design choice.
 * Returns whether it settled, so callers can say so instead of assuming it.
 */
export async function settleLayout(page, { timeoutMs = 6000, intervalMs = 250 } = {}) {
  const sample = () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll("section,header")];
      const moving = [...document.querySelectorAll("body *")].some((e) => {
        const t = getComputedStyle(e).transform;
        if (!t || t === "none") return false;
        const m = t.match(/matrix\(([^)]+)\)/);
        if (!m) return true;
        const n = m[1].split(",").map(Number);
        // identity-ish: no scale away from 1, no translation beyond a sub-pixel
        return Math.abs(n[0] - 1) > 0.01 || Math.abs(n[3] - 1) > 0.01 || Math.abs(n[4]) > 1 || Math.abs(n[5]) > 1;
      });
      return { sig: els.map((e) => e.scrollHeight).join(","), moving };
    });

  const deadline = Date.now() + timeoutMs;
  let prev = null;
  while (Date.now() < deadline) {
    const cur = await sample();
    if (prev && cur.sig === prev.sig && !cur.moving) return true;
    prev = cur;
    await page.waitForTimeout(intervalMs);
  }
  return false;
}


async function runRoute(page, w, route) {
  const vh = page.viewportSize().height;
  const errs = [];
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 140)));

  const url = base.replace(/\/$/, "") + route;
  await page.goto(url, { waitUntil: "load" }).catch(() => {});
  // wait for hydration (the boot cover clears via html.ready), then a short settle for the
  // reveal/route-transition animations — replaces a flat 4.5s idle that dominated the runtime.
  await page
    .waitForFunction(() => document.documentElement.classList.contains("ready"), { timeout: 4000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  // LAYOUT MUST SETTLE BEFORE IT IS MEASURED.
  //
  // 800ms of hydration wait is enough to screenshot but NOT enough for entrance animations to
  // finish, and every geometric assertion below reads getBoundingClientRect / scrollHeight. An
  // element still carrying `translateY(79px)` from a reveal sticks out past its section, so the
  // section's scrollHeight runs over the viewport and a perfectly correct hero is reported as
  // overflowing. Measured on an example marketing site at 390×844: scrollHeight 853 with the CTA at
  // `matrix(0.92, 0, 0, 0.92, 0, 79.2)` and opacity 0; once settled, 844 and no overflow.
  //
  // This also answers the open "freeze vs freeze + second pass" question, with evidence rather
  // than preference: freezing alone is not sufficient, because Playwright's `animations: "disabled"`
  // applies to SCREENSHOTS and does nothing for a `page.evaluate` that reads geometry. The fix has
  // to be in the measurement, not the capture.
  //
  // Polls for stability instead of sleeping a magic number: heights stop changing, and nothing is
  // still mid-transform. A fixed sleep is a bet on the slowest animation in a codebase nobody has
  // measured, and it is wrong in both directions — too short fails correct pages, too long makes
  // every sweep slower for every page that never needed it.
  await settleLayout(page);

  {
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

    // sections explicitly sized to one screen must actually FIT one screen — otherwise the
    // top/bottom get cut off and you can't see them at once (the Bible-section bug).
    //
    // This asks the BROWSER what the min-height resolves to at this width, instead of
    // grepping class names. The class-name version read `sm:min-h-[100svh]` as a promise at
    // every width, including the widths where the `sm:` prefix means it is not applied at all
    // — so a hero that correctly drops the one-screen constraint on mobile was reported as
    // overflowing on mobile. A check that fails a correct tree is a bug in the check.
    //
    // The computed value is also strictly more honest: it catches a one-screen promise however
    // it was written (utility class, arbitrary property, plain CSS, inline style), and it
    // cannot be evaded by spelling the same rule a different way.
    const screenOverflow = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll("section,header")]
        .filter((s) => {
          const mh = parseFloat(getComputedStyle(s).minHeight);
          // Only sections that promise APPROXIMATELY ONE full viewport at this width.
          //
          // The upper bound is not decoration. This used to be `mh >= vh - 1`, which matches any
          // section taller than a screen — including one DELIBERATELY set to several. A services
          // band given the four screens its reference gives it has min-height 3240px at a 900px
          // viewport, and was reported as a broken one-screen promise. It is not a promise at all,
          // it is a multi-screen section, and pinned scroll sections are routinely built that way.
          //
          // The bug this check exists for is a section that says "I am one screen" and then
          // overflows. That is still caught: min-height 100vh with 1200px of content is inside the
          // window. Anything past 1.5 viewports is asking for the height it got.
          return Number.isFinite(mh) && mh >= vh - 1 && mh <= vh * 1.5;
        })
        .filter((s) => s.scrollHeight > vh + 8)
        .map((s) => Math.round(s.scrollHeight));
    });

    // CRAMPED SEAMS — a "heavy" section (full-bleed photo / dark bg) followed by a light section
    // whose first heading sits flush against the photo with no breathing room. This is the bug that
    // kept recurring (join-the-team "Ready to serve?", plan-your-visit "Contact us") because nothing
    // measured it. Now it's mechanical and fails the build.
    const seamMin = w < 700 ? 28 : 44; // required px between a section's top and its first heading
    const seams = await page.evaluate((min) => {
      const lum = (c) => {
        const m = (c || "").match(/[\d.]+/g);
        if (!m || m.length < 3) return 1;
        if (m.length >= 4 && Number(m[3]) === 0) return 1; // transparent → treat as light
        return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
      };
      const heavy = (el) => {
        if (el.hasAttribute("data-nav-dark")) return true;
        if (lum(getComputedStyle(el).backgroundColor) < 0.5) return true;
        const er = el.getBoundingClientRect();
        for (const im of el.querySelectorAll("img")) {
          const r = im.getBoundingClientRect();
          if (r.width >= er.width * 0.9 && r.height >= er.height * 0.6) return true; // fills it
        }
        return false;
      };
      const all = [...document.querySelectorAll("section")];
      const bad = [];
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1], cur = all[i];
        const pr = prev.getBoundingClientRect(), cr = cur.getBoundingClientRect();
        if (Math.abs(cr.top - pr.bottom) > 6) continue; // not a real seam
        if (!heavy(prev) || heavy(cur)) continue; // only heavy→light matters
        const h = cur.querySelector("h1,h2,h3,p");
        if (!h) continue;
        const gap = Math.round(h.getBoundingClientRect().top - cr.top);
        if (gap < min) bad.push({ gap, heading: (h.textContent || "").trim().slice(0, 36) });
      }
      return bad;
    }, seamMin);

    // collect full-bleed band images for the cross-route repetition check
    const bands = await page.evaluate(() => {
      const out = [];
      for (const im of document.querySelectorAll("img")) {
        const r = im.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.92 && r.height >= 200) {
          out.push((im.currentSrc || im.src || "").split("/").pop().split("?")[0]);
        }
      }
      return [...new Set(out)];
    });
    for (const src of bands) {
      if (!bandUsage.has(src)) bandUsage.set(src, new Set());
      bandUsage.get(src).add(route);
    }

    // baseline shot
    await page.screenshot({ path: path.join(out, `${slug}-${w}-top.png`) });

    // auto-scroll every tall scene (pinned scrollytelling, full-bleed) to several positions
    const tall = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll("section,header")]
        .filter((s) => s.offsetHeight > 1.5 * vh)
        .map((s) => ({ top: s.getBoundingClientRect().top + window.scrollY, h: s.offsetHeight }));
    });
    let shotIdx = 0;
    for (const t of tall) {
      const range = t.h - vh;
      for (const p of [0.15, 0.4, 0.65, 0.9]) {
        await page.evaluate((y) => window.scrollTo(0, y), t.top + p * range);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(out, `${slug}-${w}-scene${shotIdx}-${Math.round(p * 100)}.png`) });
      }
      shotIdx++;
    }

    // FIXED-CHROME COLLISION — does the page's own text show THROUGH a see-through fixed header,
    // underneath its logo? A fixed bar over scrolling content always overlaps that content; that is
    // only a bug when the bar is transparent, because then the mark and the text paint in the same
    // pixels. Nothing else here catches it: overflow is about width, axe judges text-on-background
    // (not text-on-logo), and the baseline diff is taken at scroll 0 with the bar in its at-rest
    // state. It reached the live an example marketing site header — a 160px logo sitting on "Come as you are." —
    // and the screenshots that were supposed to prove the change were clipped to the bar's own
    // height, cropping out the exact region where the collision showed.
    const chromeCollisions = await page.evaluate(async () => {
      const bar = document.querySelector("header.fixed, [data-fixed-chrome]");
      if (!bar) return [];
      const isOpaque = (el) => {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (!m) return false;
        return (m.length > 3 ? Number(m[3]) : 1) >= 0.85;
      };
      const hits = [];
      const step = Math.max(200, Math.round(window.innerHeight * 0.6));
      const maxY = document.body.scrollHeight - window.innerHeight;
      for (let y = step; y <= maxY; y += step) {
        window.scrollTo(0, y);
        // Headers that hide on scroll-down and return on scroll-up are only ON SCREEN in the
        // revealed state, so scrolling downward alone would test the case where the bar is not
        // there — a blind spot that would let the gate pass a broken revealed bar. Nudge back up
        // to force the reveal before sampling.
        await new Promise((r) => setTimeout(r, 220));
        window.scrollTo(0, Math.max(0, y - 90));
        // MUST outlast the bar's own transitions before sampling. The an example marketing site header animates
        // background-color over 300ms and height over 500ms, so a 260ms wait caught the bar
        // mid-fade, read its alpha as low, and reported three collisions that were not real. The
        // checker needed checking: a flaky gate that cries wolf gets switched off, which is how
        // evaluator decay starts (memory/agent-graph-engineering.md §5).
        await new Promise((r) => setTimeout(r, 620));
        // A solid bar is allowed to cover what scrolls beneath it — that is what solid bars are for.
        if (isOpaque(bar)) continue;
        for (const mark of bar.querySelectorAll("img,svg")) {
          const L = mark.getBoundingClientRect();
          if (L.width < 4 || L.height < 4) continue;
          // A mark that is faded out covers nothing — its RECT still overlaps the text underneath,
          // which is what a naive geometry check sees. Headers that hide their logo on scroll are a
          // normal pattern, so effective opacity has to be walked up to the bar (opacity compounds
          // through ancestors) or the gate reports a collision for an element nobody can see.
          // Caught when this check disagreed with a hand-written one over the same build.
          let eff = 1;
          for (let n = mark; n && n !== bar.parentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.visibility === "hidden" || cs.display === "none") { eff = 0; break; }
            eff *= Number(cs.opacity || 1);
          }
          if (eff < 0.05) continue;
          for (const el of document.querySelectorAll("main h1,main h2,main h3,main p,main li,main a")) {
            const txt = (el.innerText || "").trim();
            if (txt.length < 3 || el.getClientRects().length === 0) continue;
            const r = el.getBoundingClientRect();
            const ox = Math.min(L.right, r.right) - Math.max(L.left, r.left);
            const oy = Math.min(L.bottom, r.bottom) - Math.max(L.top, r.top);
            if (ox > 8 && oy > 8) hits.push(`@${y}px "${txt.slice(0, 40).replace(/\s+/g, " ")}"`);
          }
        }
      }
      window.scrollTo(0, 0);
      return [...new Set(hits)].slice(0, 6);
    });
    await page.waitForTimeout(300);

    // SETTLE — trigger every whileInView reveal across the page, then wait out the longest animation
    // so both the baseline screenshot and axe sample a fully-SETTLED DOM. A reveal caught mid-fade
    // reads as a false low-contrast fail for axe AND as a false pixel regression for the baseline
    // diff; force-settling inline styles doesn't stick under concurrency (Framer's rAF overwrites
    // them) — so actually let them finish. (This flaked on /give's band before the change.)
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 70));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2400); // > the longest entrance incl. delay (hero CTAs ~1.6s) + concurrency jitter
    // anything lazily fetched during the traversal must be decoded before the shot, or the diff
    // measures "did the image arrive in time", not "did the design change"
    await page.evaluate(
      () =>
        Promise.all(
          [...document.images]
            .filter((i) => !i.complete)
            .map((i) => new Promise((r) => { i.onload = i.onerror = r; })),
        ).then(() => undefined),
    );
    // return to the top and let it actually LAND: smooth-scroll libraries (Lenis here) ease toward
    // the target, and a hero still 0.4px off its rest position resamples the photo differently —
    // which reads as a ~1.5% pixel regression on an unchanged page. Re-assert and wait it out.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(350);
    }

    // BASELINE REGRESSION SHOT — the whole settled page, with animations disabled (Playwright
    // fast-forwards finite ones and cancels infinite ones to their initial state) and the caret
    // hidden, so two runs of an UNCHANGED site produce identical bytes. Full-page, because the
    // regression this exists to catch (a shared component silently changing an unrelated page)
    // usually happens below the fold. The auto-scrolled scene frames above are deliberately NOT
    // baselined: their content depends on where a scroll-driven animation happens to be.
    const baseShot = path.join(out, `${slug}-${w}.png`);
    await page.screenshot({ path: baseShot, fullPage: true, animations: "disabled", caret: "hide" });
    checkBaseline(`${slug}-${w}`, baseShot);

    // axe-core WCAG2 AA — runs on the settled DOM above.
    let axe = "skip";
    if (axeSrc) {
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
      });
      const serious = res.filter((v) => v.impact === "serious" || v.impact === "critical");
      axe = res.length ? res.map((v) => `${v.id}(${v.impact}×${v.n})`).join(",") : "0";
      if (serious.length) failed = true;
    }

    if (overflow !== 0 || errs.length || screenOverflow.length || seams.length || chromeCollisions.length)
      failed = true;
    rows.push({ route, w, overflow, errs: errs.length, errSample: errs[0] || "", axe, screenOverflow, seams, chromeCollisions });
    const so = screenOverflow.length ? ` screenOverflow=${screenOverflow.join(",")}` : "";
    const sm = seams.length ? ` SEAM=${seams.map((s) => `"${s.heading}"@${s.gap}px`).join(",")}` : "";
    const cc = chromeCollisions.length ? ` CHROME-COLLISION=${chromeCollisions.join(" | ")}` : "";
    console.log(
      `${w.toString().padStart(4)} ${route.padEnd(20)} overflow=${overflow} errs=${errs.length} axe=${axe}${so}${sm}${cc}`,
    );
  }
}

const browser = await chromium.launch();
for (const w of widths) {
  const vh = w < 500 ? 760 : 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: vh } });
  const queue = [...routes];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, routes.length) }, async () => {
      const page = await ctx.newPage();
      let route;
      while ((route = queue.shift()) !== undefined) await runRoute(page, w, route);
      await page.close();
    }),
  );
  await ctx.close();
}

await browser.close();

// REDUCED-MOTION HYDRATION LINT (source scan) — branching a motion component's `initial`/`hidden`
// state on useReducedMotion() makes the server HTML (which can't read the preference) differ from a
// reduced-motion client and trips a hydration mismatch. That mismatch is a DEV-only console warning
// (the production/static build the sweep serves never logs it), and it's invisible unless the tester
// has reduced motion enabled — so a runtime check can't see it. Catch it deterministically at the
// source instead: flag any `initial={{…reduce…}}` or `hidden: {…reduce…}`. (This class shipped once:
// Reveal/MaskReveal/ScaleInImage branched their initial transform on reduced-motion.)
{
  const srcArg = arg("--src", null);
  // Enumerate projects/*/src rather than naming one project: a hardcoded name only ever scans the
  // repo it was written in, and scans nothing at all in anyone else's.
  const projectSrcs = () => {
    try { return fs.readdirSync("projects", { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => path.join("projects", d.name, "src")); }
    catch { return []; }
  };
  const srcDirs = (srcArg || ["src", ...projectSrcs()]).filter((d) => fs.existsSync(d));
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
      const text = fs.readFileSync(p, "utf8");
      text.split("\n").forEach((line, i) => {
        // an `initial=` prop or a `hidden:`/variant object that references the reduced-motion flag
        if (/(initial=\{\{|hidden:\s*\{|whileInView=\{\{)[^}]*\breduce\b/.test(line)) {
          hits.push(`${p}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
  };
  for (const d of srcDirs) walk(d);
  if (hits.length) {
    failed = true;
    console.log(`\nREDUCED-MOTION HYDRATION RISK — initial state branches on reduced-motion (${hits.length}):`);
    for (const h of hits.slice(0, 8)) console.log("  " + h);
    console.log("  → keep the `initial`/`hidden` deterministic; let reduced-motion only zero the transition.");
  } else {
    console.log("\nreduced-motion hydration lint: clean");
  }
}

// cross-route band repetition — the same full-bleed photo used as a band on 2+ routes reads as
// lazy/templated (the "every page ends on the same abstract image" miss). Flag and fail — UNLESS the
// repeat is intentional and declared. Allowed repeats come from `--allow-repeat <substr…>` and/or a
// `.visual-qa.json` in the project ({"allowRepeatBands":["about-champions"]}); matched by substring so
// the content-hash in the emitted filename doesn't matter.
const allowRepeat = [...(arg("--allow-repeat", []) || [])];
try {
  const cfgPath = path.resolve(process.cwd(), ".visual-qa.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    if (Array.isArray(cfg.allowRepeatBands)) allowRepeat.push(...cfg.allowRepeatBands);
  }
} catch (e) {
  console.log(`\n.visual-qa.json unreadable (${e.message}) — ignoring allowlist`);
}
const isAllowed = (src) => allowRepeat.some((a) => src.includes(a));
const repeated = [...bandUsage.entries()]
  .filter(([, r]) => r.size >= 2)
  .filter(([src]) => !isAllowed(src));
const allowedRepeats = [...bandUsage.entries()].filter(([src, r]) => r.size >= 2 && isAllowed(src));
if (allowedRepeats.length) {
  console.log("\nallowed repeated bands (declared intentional):");
  for (const [src, r] of allowedRepeats) console.log(`  ${src} → ${[...r].join(", ")}`);
}
if (repeated.length) {
  failed = true;
  console.log("\nREPEATED full-bleed band image across routes:");
  for (const [src, r] of repeated) console.log(`  ${src} → ${[...r].join(", ")}`);
}

// ---- baseline regression summary --------------------------------------------------------------
{
  const by = (s) => baselineRows.filter((r) => r.status === s);
  const created = by("created"), updated = by("updated"), unchanged = by("unchanged");
  const changed = by("changed"), regressions = by("regression"), errors = by("error");
  console.log(
    `\nbaseline regression (dir ${baselineDir}, threshold ${regressionThreshold.toFixed(2)}%, tolerance ${pixelTolerance}/255):`,
  );
  if (!baselineRows.length) console.log("  no shots compared");
  for (const r of created) console.log(`  baseline created   ${r.name}`);
  for (const r of updated) console.log(`  baseline UPDATED   ${r.name}  (--update-baselines)`);
  for (const r of unchanged) console.log(`  unchanged          ${r.name}`);
  for (const r of changed)
    console.log(`  changed ${r.pct.toFixed(2).padStart(6)}%   ${r.name}  (under threshold)`);
  for (const r of regressions) {
    console.log(`  REGRESSION ${r.pct.toFixed(2)}%  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    if (r.diff) console.log(`      diff image: ${r.diff}`);
    if (r.current) console.log(`      current shot: ${r.current}   baseline: ${r.baseline}`);
  }
  for (const r of errors) console.log(`  BASELINE CHECK FAILED TO RUN  ${r.name} — ${r.detail}`);

  if (errors.length) {
    // a comparison that could not be made is NOT a pass (agent-graph-engineering §5)
    failed = true;
    console.log(
      `\nBASELINE CHECK BROKEN on ${errors.length} shot(s) — treating as FAIL. A skipped check is not a pass.`,
    );
  }
  if (regressions.length) {
    if (failOnRegression) {
      failed = true;
      console.log(`\n${regressions.length} visual regression(s) — FAILING (--fail-on-regression).`);
    } else {
      console.log(
        `\n${regressions.length} visual regression(s) above ${regressionThreshold}% — reported, NOT failing.` +
          "\n  → LOOK at the diff images above. If the change is intentional, re-run with --update-baselines to bless it." +
          "\n  → Use --fail-on-regression to make this a hard gate.",
      );
    }
  }
}

fs.writeFileSync(
  path.join(out, "report.json"),
  JSON.stringify(
    {
      rows,
      repeatedBands: repeated.map(([src, r]) => ({ src, routes: [...r] })),
      baselines: { dir: baselineDir, thresholdPct: regressionThreshold, failOnRegression, updateBaselines, shots: baselineRows },
    },
    null,
    2,
  ),
);
console.log(`\nScreenshots + report.json in ${out}`);
console.log(
  failed
    ? "RESULT: FAIL (overflow / console errors / serious a11y / broken baseline check) — and go LOOK at the shots."
    : "RESULT: pass — but still LOOK at the shots (including any reported visual regression).",
);
process.exit(failed ? 1 : 0);
