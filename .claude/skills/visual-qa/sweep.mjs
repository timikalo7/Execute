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
 * Env: PLAYWRIGHT_BROWSERS_PATH (browsers), AXE (path to axe.min.js; auto-detected in node_modules).
 *
 * Exit code is non-zero if any route has overflow, console errors, or serious/critical axe
 * violations — so it can gate a commit. But the screenshots are the point: open them.
 */
import fs from "node:fs";
import path from "node:path";

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

const base = (arg("--base", ["http://localhost:8099"]))[0];
const out = (arg("--out", ["/tmp/visual-qa"]))[0];
const routes = arg("--routes", ["/"]);
const widths = arg("--widths", ["390", "768", "1440"]).map(Number);

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

  {
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

    // sections explicitly sized to one screen must actually FIT one screen — otherwise the
    // top/bottom get cut off and you can't see them at once (the Bible-section bug).
    const screenOverflow = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll("section,header")]
        .filter((s) => /min-h-\[100svh\]|min-h-screen|min-h-\[100vh\]|min-h-\[100dvh\]/.test(s.className))
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

    // axe-core WCAG2 AA — settle first so we don't flag elements mid-fade (a scroll-driven scene
    // caught between opacity keyframes reads as a false contrast failure). Rather than wait a long
    // time for every reveal to finish (slow, and flaky under concurrency), force any in-flight motion
    // element to its SETTLED state — opacity 1 / no transform — so axe samples the final contrast a
    // user sees, deterministically.
    let axe = "skip";
    if (axeSrc) {
      // Trigger every whileInView reveal across the page, then wait out the longest animation so axe
      // samples a fully-SETTLED DOM. A reveal caught mid-fade reads as a false low-contrast fail, and
      // force-settling inline styles doesn't stick under concurrency (Framer's rAF overwrites them) —
      // so actually let them finish. (This flaked on /give's band before the change.)
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y <= document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 70));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(2400); // > the longest entrance incl. delay (hero CTAs ~1.6s) + concurrency jitter
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
      });
      const serious = res.filter((v) => v.impact === "serious" || v.impact === "critical");
      axe = res.length ? res.map((v) => `${v.id}(${v.impact}×${v.n})`).join(",") : "0";
      if (serious.length) failed = true;
    }

    if (overflow !== 0 || errs.length || screenOverflow.length || seams.length) failed = true;
    rows.push({ route, w, overflow, errs: errs.length, errSample: errs[0] || "", axe, screenOverflow, seams });
    const so = screenOverflow.length ? ` screenOverflow=${screenOverflow.join(",")}` : "";
    const sm = seams.length ? ` SEAM=${seams.map((s) => `"${s.heading}"@${s.gap}px`).join(",")}` : "";
    console.log(
      `${w.toString().padStart(4)} ${route.padEnd(20)} overflow=${overflow} errs=${errs.length} axe=${axe}${so}${sm}`,
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
  const srcDirs = (srcArg || [
    "src",
    "projects/example-marketing-site/src",
  ]).filter((d) => fs.existsSync(d));
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

fs.writeFileSync(
  path.join(out, "report.json"),
  JSON.stringify({ rows, repeatedBands: repeated.map(([src, r]) => ({ src, routes: [...r] })) }, null, 2),
);
console.log(`\nScreenshots + report.json in ${out}`);
console.log(failed ? "RESULT: FAIL (overflow / console errors / serious a11y) — and go LOOK at the shots." : "RESULT: pass — but still LOOK at the shots.");
process.exit(failed ? 1 : 0);
