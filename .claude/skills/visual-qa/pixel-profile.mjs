#!/usr/bin/env node
/**
 * pixel-profile — compare what two pages actually LOOK like, from their pixels.
 *
 * Why this exists on top of fidelity.mjs: that file reads five numbers off the DOM — glyph width,
 * display scale, case, ground luminance, subject fill — and passed a build the owner rejected on
 * sight. Five style properties is not a description of a page. It cannot see composition, density,
 * rhythm, colour or detail, so "fidelity: pass" only ever meant "the type width and the grounds are
 * in the right ballpark".
 *
 * This looks at the rendered image instead. Both pages are captured full-page, downscaled, and
 * profiled band by band down their length:
 *
 *   - TONAL RHYTHM   mean luminance per band → the light/dark sequence a page reads as.
 *   - INK COVERAGE   share of pixels departing from the band's own modal background → how full
 *                    each screen is. A page of near-empty white bands and one of full-bleed scenes
 *                    score very differently here even when both are "white".
 *   - EDGE DENSITY   share of pixels at a local gradient → detail and busyness. Line drawings and
 *                    photographs are worlds apart on this and identical on every DOM metric.
 *   - CHROMA         mean saturation. A page that is entirely achromatic against a reference full
 *                    of colour is not the same design, and nothing in the DOM says so.
 *
 * Pixels are read inside the browser via canvas, so there is no image-decoding dependency.
 *
 *   node pixel-profile.mjs --ref <url|profile.json> --built <url> [--save-ref f.json] [--fail]
 *   node pixel-profile.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const BANDS = 24;
/*
 * TOLERANCES, tightened after the owner asked how a build that "is not close" had passed.
 *
 * The old values allowed a 45% relative difference in ink coverage and 50% in edge density — a page
 * carrying HALF the reference's detail scored as alike. That is not a tolerance, it is an excuse.
 *
 * The worse flaw was the comparison itself: ink and edge were collapsed to page-wide MEANS. A build
 * whose first scene is a photograph and whose second is four flat rectangles averages out to the
 * same number as one that is consistently mid-detail, and that is exactly what happened — one scene
 * got a real cut-out, the other kept its vector placeholder, and the mean absorbed the difference.
 * Both are now compared BAND BY BAND, so a single empty stretch cannot be hidden by a dense one.
 */
export const TOLERANCE = { rhythm: 0.18, ink: 0.012, edge: 0.006, chroma: 0.04, worstBand: 0.05 };

/** Runs inside the page: profile an image already drawn to a canvas. */
export const PROFILE_IN_PAGE = ([dataUrl, bands]) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = 240;
      const H = Math.max(bands, Math.round((img.height / img.width) * W));
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
      const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

      const rows = Math.floor(H / bands);
      const rhythm = [], ink = [], edge = [], chroma = [];
      for (let b = 0; b < bands; b++) {
        const y0 = b * rows, y1 = Math.min(H - 1, y0 + rows);
        let sum = 0, n = 0, chr = 0;
        const hist = new Array(16).fill(0);
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
          const p = at(x, y), l = lum(p);
          sum += l; chr += sat(p); n++;
          hist[Math.min(15, Math.floor(l * 16))]++;
        }
        if (!n) { rhythm.push(0); ink.push(0); edge.push(0); chroma.push(0); continue; }
        const mean = sum / n;
        // Modal luminance bucket is the band's own background; anything far from it is "ink".
        const modal = hist.indexOf(Math.max(...hist));
        let inkN = 0, edgeN = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
          const l = lum(at(x, y));
          if (Math.abs(Math.floor(l * 16) - modal) > 2) inkN++;
          if (x > 0 && y > y0) {
            const gx = Math.abs(l - lum(at(x - 1, y)));
            const gy = Math.abs(l - lum(at(x, y - 1)));
            if (gx + gy > 0.16) edgeN++;
          }
        }
        rhythm.push(+mean.toFixed(4));
        ink.push(+(inkN / n).toFixed(4));
        edge.push(+(edgeN / n).toFixed(4));
        chroma.push(+(chr / n).toFixed(4));
      }
      resolve({ rhythm, ink, edge, chroma, aspect: +(img.height / img.width).toFixed(2) });
    };
    img.src = dataUrl;
  });

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** Mean absolute difference between two same-length series. */
export function seriesDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 1;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}
/** How many times the page crosses the mid-tone: the count of ground changes. */
export function transitions(series, mid = 0.5) {
  let t = 0;
  for (let i = 1; i < series.length; i++) if ((series[i - 1] < mid) !== (series[i] < mid)) t++;
  return t;
}

export function compareProfiles(ref, built, tol = TOLERANCE) {
  const f = [];
  const rd = seriesDiff(ref.rhythm, built.rhythm);
  if (rd > tol.rhythm)
    f.push({ id: "tonal-rhythm", detail: `the light/dark sequence differs by ${rd.toFixed(3)} mean luminance per band (tolerance ${tol.rhythm}). Reference crosses mid-tone ${transitions(ref.rhythm)}×, build ${transitions(built.rhythm)}×.` });

  // Per-band, not page-wide. seriesDiff is the mean ABSOLUTE difference between matched bands, so
  // an empty stretch and a dense stretch add up instead of cancelling out.
  const id = seriesDiff(ref.ink, built.ink);
  if (id > tol.ink)
    f.push({ id: "ink-coverage", detail: `content density differs by ${(id * 100).toFixed(2)} percentage points per band (tolerance ${(tol.ink * 100).toFixed(1)}). Page means are ${(mean(built.ink) * 100).toFixed(1)}% against ${(mean(ref.ink) * 100).toFixed(1)}% — but the per-band gap is what matters, because one full scene and one empty one average to something reasonable.` });

  const ed = seriesDiff(ref.edge, built.edge);
  if (ed > tol.edge)
    f.push({ id: "edge-density", detail: `detail level differs by ${(ed * 100).toFixed(2)} percentage points per band (tolerance ${(tol.edge * 100).toFixed(1)}). Line drawings and photographs sit far apart here and identical on every DOM metric.` });

  // The single worst band. A build can be close on average and still have one screen that is plainly
  // not the same design, and that screen is what a person notices first.
  const n = Math.min(ref.ink.length, built.ink.length);
  let worst = 0, worstAt = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(ref.ink[i] - built.ink[i]);
    if (d > worst) { worst = d; worstAt = i; }
  }
  if (worst > tol.worstBand)
    f.push({ id: "worst-band", detail: `band ${worstAt + 1} of ${n} differs by ${(worst * 100).toFixed(1)} percentage points of content — roughly ${Math.round((worstAt / n) * 100)}% of the way down the page. One screen being wrong is what a person sees first, and an average hides it.` });

  const rc = mean(ref.chroma), bc = mean(built.chroma);
  if (Math.abs(rc - bc) > tol.chroma)
    f.push({ id: "chroma", detail: `colour differs — mean saturation ${bc.toFixed(3)} vs ${rc.toFixed(3)}. ${bc < rc ? "The build is effectively greyscale where the reference is not." : "The build is more saturated than the reference."}` });

  return f;
}

/* --------------------------------------------------------------------------- selftest */

function selfTest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };
  const flat = (v, n = BANDS) => new Array(n).fill(v);
  const base = { rhythm: [...flat(0.95, 12), ...flat(0.05, 12)], ink: flat(0.34), edge: flat(0.09), chroma: flat(0.22), aspect: 8 };

  check(compareProfiles(base, { ...base }).length === 0, "identical profiles produce no findings");
  check(compareProfiles(base, { ...base, rhythm: flat(0.95) }).some((x) => x.id === "tonal-rhythm"),
    "an all-white page against a page that alternates is caught");
  check(compareProfiles(base, { ...base, ink: flat(0.04) }).some((x) => x.id === "ink-coverage"),
    "near-empty bands against full ones are caught — the white-space problem");
  // The failure the owner caught: one scene right, one scene wrong, page mean unchanged.
  const halfWrong = [...flat(0.62, 12), ...flat(0.06, 12)];
  const sameMean = flat(0.34);
  check(Math.abs(mean(halfWrong) - mean(sameMean)) < 0.01, "the fixture really does share a page mean");
  check(compareProfiles({ ...base, ink: sameMean }, { ...base, ink: halfWrong }).some((x) => x.id === "ink-coverage"),
    "HALF the page being wrong is caught even when the page MEAN is identical — the flaw that passed a build the owner rejected");
  check(compareProfiles({ ...base, ink: sameMean }, { ...base, ink: halfWrong }).some((x) => x.id === "worst-band"),
    "the single worst band is named, since one bad screen is what a person notices first");
  check(compareProfiles(base, { ...base, edge: flat(0.005) }).some((x) => x.id === "edge-density"),
    "a line drawing against photography is caught");
  check(compareProfiles(base, { ...base, chroma: flat(0.005) }).some((x) => x.id === "chroma"),
    "a greyscale build against a colour reference is caught");
  check(compareProfiles(base, { ...base, ink: flat(0.33) }).length === 0, "a small ink difference is tolerated");
  check(transitions([0.9, 0.9, 0.1, 0.1, 0.9]) === 2, "mid-tone crossings are counted");
  check(seriesDiff([1, 1], [0, 0]) === 1, "series difference is a mean absolute difference");
  check(seriesDiff([], []) === 1, "an empty profile is maximally different, not silently equal");
  check(typeof PROFILE_IN_PAGE === "function", "the profiler is a plain function evaluable in-page");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — pixel-profile: ${pass} passed, ${fail} failed`);
  return fail;
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selfTest() ? 1 : 0);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const REF = arg("--ref"), BUILT = arg("--built");
  if (!REF || !BUILT) { console.error("usage: pixel-profile.mjs --ref <url|json> --built <url> [--save-ref f] [--fail]"); process.exit(2); }

  const here = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(here, "../../..");
  // Enumerate projects/* rather than naming them: a hardcoded list only resolves in the repo it was
  // written in, and silently reports "playwright not resolvable" in every other one.
  const projectDirs = (root) => {
    try { return fs.readdirSync(path.join(root, "projects"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => path.join("projects", d.name)); }
    catch { return []; }
  };
  const anchors = [path.resolve(process.cwd(), "package.json"),
    ...[...new Set([...projectDirs(repoRoot), ...projectDirs(process.cwd())])]
      .flatMap((r) => [path.resolve(repoRoot, r, "package.json"), path.resolve(process.cwd(), r, "package.json")])]
    .filter((p) => fs.existsSync(p));
  let chromium;
  for (const a of anchors) { try { chromium = createRequire(a)("playwright").chromium; break; } catch {} }
  if (!chromium) { console.error("playwright not resolvable"); process.exit(3); }
  const exe = (fs.existsSync("/opt/pw-browsers") ? fs.readdirSync("/opt/pw-browsers").filter((x) => x.startsWith("chromium")).map((x) => `/opt/pw-browsers/${x}/chrome-linux/chrome`) : []).find((p) => fs.existsSync(p));

  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  async function profile(url, viaNode) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (viaNode) {
      await ctx.route("**/*", async (route) => {
        const req = route.request();
        try {
          const r = await fetch(req.url(), { method: req.method(), headers: { ...req.headers(), "accept-encoding": "identity" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
          const body = Buffer.from(await r.arrayBuffer());
          const headers = {};
          r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "content-security-policy", "content-security-policy-report-only"].includes(k)) headers[k] = v; });
          await route.fulfill({ status: r.status, headers, body });
        } catch { try { await route.abort(); } catch {} }
      });
    }
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(viaNode ? 9000 : 3500);
    // Walk the page first so lazy scenes render, then capture the whole thing.
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += 800) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(220); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    const shot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
    const dataUrl = `data:image/jpeg;base64,${shot.toString("base64")}`;
    // Passed straight to page.evaluate, which serialises the function itself. The first version
    // stringified it and rebuilt it in-page with eval / new Function — which the security gate
    // correctly flagged, and which was never necessary: Playwright already does this safely.
    const prof = await page.evaluate(PROFILE_IN_PAGE, [dataUrl, BANDS]);
    await ctx.close();
    return prof;
  }

  const refIsFile = REF.endsWith(".json");
  const ref = refIsFile ? JSON.parse(fs.readFileSync(REF, "utf8")).profile : await profile(REF, /^https?:\/\/(?!localhost|127\.)/.test(REF));
  if (!refIsFile && arg("--save-ref")) {
    fs.writeFileSync(arg("--save-ref"), JSON.stringify({ _source: REF, captured: new Date().toISOString().slice(0, 10), profile: ref }, null, 2) + "\n");
    console.log(`(reference profile saved to ${arg("--save-ref")})`);
  }
  const built = await profile(BUILT, false);
  await browser.close();

  const row = (l, p) => console.log(`  ${l.padEnd(9)} ink ${(mean(p.ink) * 100).toFixed(1)}%  edge ${(mean(p.edge) * 100).toFixed(1)}%  chroma ${mean(p.chroma).toFixed(3)}  mid-crossings ${transitions(p.rhythm)}  aspect ${p.aspect}`);
  console.log("");
  row("REFERENCE", ref);
  row("BUILT", built);

  const findings = compareProfiles(ref, built);
  console.log("");
  if (!findings.length) console.log("RESULT: pass — the rendered pages profile alike.");
  else {
    console.log(`PIXEL FINDINGS (${findings.length}):`);
    for (const f of findings) console.log(`  ${f.id.padEnd(14)} ${f.detail}`);
    console.log(`\nRESULT: ${argv.includes("--fail") ? "FAIL" : "advisory"} — ${findings.length} way(s) in which the rendered page differs.`);
  }
  process.exit(argv.includes("--fail") && findings.length ? 1 : 0);
}
