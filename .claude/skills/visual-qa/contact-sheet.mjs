#!/usr/bin/env node
/**
 * contact-sheet — put the whole reference page and the whole build side by side, in one image,
 * and check that they tell the same story from top to bottom.
 *
 * WHY THIS EXISTS. A clone of a long scrolling page was built, measured, gated and shipped without
 * anyone ever looking at the reference page in full. Every check compared the build against either
 * a short video, a handful of DOM properties, or a profile captured from the same partial view. The
 * owner looked at the two pages, said "it's not close", and was right: the reference opens on a
 * black space scene and crosses between light and dark grounds six times; the build was white
 * almost throughout. No amount of tolerance-tightening finds that, because the comparison never
 * had the reference to compare against.
 *
 * So this tool does the thing nobody had done: capture BOTH pages end to end and lay them out
 * together. It produces two outputs, and both matter.
 *
 *   1. A composite image — reference on the left, build on the right, one row per position down
 *      the page. This is for eyes, human or model. It is the artifact that makes "not close"
 *      obvious in one glance instead of arguable across ten metrics.
 *   2. A GROUND SEQUENCE check. Each row is classified dark / mid / light, and the two sequences
 *      are compared. This is deliberately the crudest possible metric, because the failure it
 *      catches was crude: a page that is light where the reference is dark is not that page, and
 *      that single fact was invisible to everything else in this skill.
 *
 * Positions are taken at equal FRACTIONS of each page's own scroll height, not at equal pixel
 * offsets. A clone is rarely the same length as its reference, and comparing absolute offsets
 * would misalign every section after the first difference in spacing. Fractions compare the
 * sequence of sections, which is what fidelity means here.
 *
 *   node contact-sheet.mjs --ref-dir <dir of slice images> --built <url> [--out sheet.jpg] [--fail]
 *   node contact-sheet.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** Below this mean luminance a screen reads as a dark ground; above the other, as a light one. */
export const GROUND = { dark: 0.28, light: 0.62 };
/**
 * Thresholds. A clone need not match every row — a section can be a screen longer or shorter and
 * push its neighbours around — but if it disagrees on more than a quarter of the page, the two
 * pages do not have the same shape. `crossings` is the count of light/dark changes: a page that
 * alternates six times and one that never leaves white are different designs even if, by accident,
 * enough individual rows happen to line up.
 */
export const AGREEMENT = { minRows: 0.75, maxCrossingGap: 2 };

export function classify(meanLum) {
  if (meanLum < GROUND.dark) return "dark";
  if (meanLum > GROUND.light) return "light";
  return "mid";
}

/** How many times a sequence changes ground. Mid rows are transitions and do not count as changes. */
export function crossings(classes) {
  let last = null, n = 0;
  for (const c of classes) {
    if (c === "mid") continue;
    if (last !== null && c !== last) n++;
    last = c;
  }
  return n;
}

export function compareSequences(refL, builtL) {
  const n = Math.min(refL.length, builtL.length);
  const rc = refL.slice(0, n).map(classify);
  const bc = builtL.slice(0, n).map(classify);
  const rows = [];
  let agree = 0;
  for (let i = 0; i < n; i++) {
    const ok = rc[i] === bc[i];
    if (ok) agree++;
    rows.push({ i, ref: rc[i], built: bc[i], ok, refL: +refL[i].toFixed(3), builtL: +builtL[i].toFixed(3) });
  }
  const ratio = n ? agree / n : 0;
  const rx = crossings(rc), bx = crossings(bc);
  const findings = [];
  if (ratio < AGREEMENT.minRows)
    findings.push({
      id: "ground-sequence",
      detail: `the build has the wrong ground on ${n - agree} of ${n} screens (${(ratio * 100).toFixed(0)}% agree, needs ${AGREEMENT.minRows * 100}%). ` +
        `Wrong at: ${rows.filter((r) => !r.ok).map((r) => `${r.i} wants ${r.ref} got ${r.built}`).join("; ")}`,
    });
  if (Math.abs(rx - bx) > AGREEMENT.maxCrossingGap)
    findings.push({
      id: "ground-crossings",
      detail: `the reference changes between light and dark grounds ${rx}× down the page; the build ${bx}×. A page that alternates and one that does not are different designs, however close their averages.`,
    });
  return { n, agree, ratio: +ratio.toFixed(3), refCrossings: rx, builtCrossings: bx, rows, findings };
}

/* ---------------------------------------------------------------- in-page */

/** Decode a list of data URLs, measure mean luminance, and lay them out as a two-column sheet. */
const SHEET_IN_PAGE = async ([refUrls, builtUrls, cellW]) => {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("decode failed"));
    im.src = src;
  });
  const refs = await Promise.all(refUrls.map(load));
  const builts = await Promise.all(builtUrls.map(load));
  const n = Math.min(refs.length, builts.length);

  const cellH = Math.round(cellW * 0.625);
  const gap = 6, label = 14;
  const sheet = document.createElement("canvas");
  sheet.width = cellW * 2 + gap * 3;
  sheet.height = n * (cellH + gap + label) + gap;
  const g = sheet.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, sheet.width, sheet.height);

  const meanOf = (im) => {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 60;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(im, 0, 0, 96, 60);
    const { data } = x.getImageData(0, 0, 96, 60);
    let s = 0;
    for (let i = 0; i < data.length; i += 4) s += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    return s / (data.length / 4);
  };

  const refL = [], builtL = [];
  for (let i = 0; i < n; i++) {
    const y = gap + i * (cellH + gap + label) + label;
    g.drawImage(refs[i], gap, y, cellW, cellH);
    g.drawImage(builts[i], gap * 2 + cellW, y, cellW, cellH);
    refL.push(meanOf(refs[i]));
    builtL.push(meanOf(builts[i]));
    g.fillStyle = "#000";
    g.font = "11px monospace";
    g.fillText(`${i}  reference`, gap, y - 3);
    g.fillText(`${i}  build`, gap * 2 + cellW, y - 3);
  }
  return { sheet: sheet.toDataURL("image/jpeg", 0.8), refL, builtL };
};

/* ------------------------------------------------------------------ capture */

/**
 * Find playwright wherever it happens to be installed. Sibling tools in this skill anchor the
 * resolution on a hardcoded list of project directories, which quietly returns "not resolvable"
 * the first time the tool is pointed at a project nobody added to the list. This walks instead:
 * the working directory and its ancestors, every project that has its own node_modules, and
 * finally the global install.
 */
function resolveChromium() {
  const anchors = [];
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    anchors.push(path.join(d, "package.json"));
    if (d === path.dirname(d)) break;
  }
  const here = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(here, "../../..");
  const projects = path.join(repoRoot, "projects");
  if (fs.existsSync(projects))
    for (const p of fs.readdirSync(projects)) anchors.push(path.join(projects, p, "package.json"));
  for (const g of ["/opt/node22/lib/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules"])
    anchors.push(path.join(g, "x.js"));

  for (const a of anchors) {
    try { return createRequire(a)("playwright").chromium; } catch {}
  }
  return null;
}

function chromiumExecutable() {
  if (!fs.existsSync("/opt/pw-browsers")) return undefined;
  return fs.readdirSync("/opt/pw-browsers")
    .filter((d) => d.startsWith("chromium"))
    .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
    .find((p) => fs.existsSync(p));
}

const toDataUrl = (buf, mime) => `data:${mime};base64,${buf.toString("base64")}`;

/** Capture `count` viewports at equal fractions of the page's own scroll height. */
export async function captureBuilt(page, url, count, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "networkidle" });
  /**
   * Wait past a loading screen before the shutter opens.
   *
   * The page under test grew a preloader that holds for 1200ms, while networkidle arrived at 571ms.
   * The capture was therefore photographing the LOADING SCREEN as slice 0 and comparing it against
   * the reference's hero — which made an independent judge report "the opening screen carries no
   * headline at all" as its single worst finding, and put band 0's ink and edge measurements on the
   * wrong thing entirely. Three checks were reading a frame the visitor barely sees.
   *
   * Generic rather than page-specific: wait for the usual busy signals to clear, then require the
   * first screenful to stop changing. A page with no loader settles immediately and pays ~600ms.
   */
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], [role="progressbar"], [data-preloader]'),
    null, { timeout: 8000 }).catch(() => {});
  let last = null;
  for (let i = 0; i < 8; i++) {
    const shot = (await page.screenshot({ type: "jpeg", quality: 40, clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } })).toString("base64");
    if (last && shot.length === last.length) break;   // first screenful has stopped changing
    last = shot;
    await page.waitForTimeout(300);
  }
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const span = Math.max(0, total - viewport.height);
  const shots = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : Math.round((i / (count - 1)) * span);
    await page.evaluate((to) => window.scrollTo(0, to), y);
    // Lenis owns the scroll on this project, so a scrollTo is a request rather than a jump. Wait
    // for the page to actually be where it was asked to be before the shutter opens.
    await page.waitForFunction(
      (want) => Math.abs(window.scrollY - want) < 40 || window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2,
      y,
      { timeout: 5000 },
    ).catch(() => {});
    await page.waitForTimeout(450);
    shots.push(await page.screenshot({ type: "jpeg", quality: 80, animations: "disabled" }));
  }
  return shots;
}

/* ----------------------------------------------------------------- selftest */

function selftest() {
  const checks = [];
  const t = (name, cond) => checks.push({ name, ok: !!cond });

  t("classify dark", classify(0.09) === "dark");
  t("classify mid", classify(0.42) === "mid");
  t("classify light", classify(0.92) === "light");
  t("boundaries are exclusive", classify(GROUND.dark) === "mid" && classify(GROUND.light) === "mid");

  t("crossings counts alternation", crossings(["dark", "dark", "light", "light", "dark"]) === 2);
  t("crossings ignores mid", crossings(["dark", "mid", "mid", "dark"]) === 0);
  t("crossings of a flat page is 0", crossings(Array(10).fill("light")) === 0);

  // The real failure, reproduced: the reference alternates, the build is white throughout.
  const refReal = [0.09, 0.24, 0.92, 0.93, 0.84, 0.84, 0.84, 0.83, 0.85, 0.74, 0.42, 0.44, 0.41,
    0.42, 0.46, 0.59, 0.84, 0.85, 0.62, 0.20, 0.19, 0.17, 0.18, 0.21, 0.29, 0.75, 0.93, 0.95,
    0.99, 0.98, 0.26, 0.30, 0.68, 0.66];
  const builtWhite = refReal.map(() => 0.93);
  const bad = compareSequences(refReal, builtWhite);
  t("FAILS an all-white build against an alternating reference", bad.findings.some((f) => f.id === "ground-sequence"));
  t("names the crossing gap too", bad.findings.some((f) => f.id === "ground-crossings"));
  t("reports the real crossing count", bad.refCrossings >= 4 && bad.builtCrossings === 0);
  t("lists which screens are wrong", /wants dark got light/.test(bad.findings[0].detail));

  // And passes a build that follows the same sequence with ordinary per-screen variation.
  const builtGood = refReal.map((v) => Math.min(1, Math.max(0, v + (v > 0.6 ? -0.05 : 0.04))));
  const good = compareSequences(refReal, builtGood);
  t("PASSES a build that follows the same sequence", good.findings.length === 0);
  t("agreement is reported as a ratio", good.ratio > 0.9 && good.ratio <= 1);

  // A build that is dark in the right places but never returns to light is not the same page.
  const builtStuckDark = refReal.map((v, i) => (i < 2 ? v : 0.12));
  const stuck = compareSequences(refReal, builtStuckDark);
  t("FAILS a build stuck on one ground", stuck.findings.length > 0);

  // Length mismatch must not throw or silently pass.
  const short = compareSequences(refReal, [0.09, 0.24]);
  t("handles a short build without throwing", short.n === 2);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length === 0 ? 0 : 1;
}

/* --------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  if (argv.includes("--selftest")) process.exit(selftest());

  const refDir = arg("--ref-dir");
  const built = arg("--built");
  const out = arg("--out", "contact-sheet.jpg");
  if (!refDir || !built) {
    console.error("usage: contact-sheet.mjs --ref-dir <dir> --built <url> [--out sheet.jpg] [--fail]");
    process.exit(2);
  }
  const refFiles = fs.readdirSync(refDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
    .map((f) => path.join(refDir, f));
  if (!refFiles.length) { console.error(`no reference images in ${refDir}`); process.exit(2); }

  const chromium = resolveChromium();
  if (!chromium) { console.error("NOT CHECKED — playwright is not resolvable from here"); process.exit(4); }
  const exe = chromiumExecutable();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  let result;
  try {
    const page = await browser.newPage();
    const shots = await captureBuilt(page, built, refFiles.length);
    const refUrls = refFiles.map((f) => toDataUrl(fs.readFileSync(f), f.endsWith(".png") ? "image/png" : "image/jpeg"));
    const builtUrls = shots.map((b) => toDataUrl(b, "image/jpeg"));
    const blank = await browser.newPage();
    await blank.goto("about:blank");
    result = await blank.evaluate(SHEET_IN_PAGE, [refUrls, builtUrls, 360]);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(out, Buffer.from(result.sheet.split(",")[1], "base64"));
  const cmp = compareSequences(result.refL, result.builtL);

  console.log(`contact sheet written to ${out}  (${cmp.n} positions, reference | build)\n`);
  console.log("pos  reference        build");
  for (const r of cmp.rows)
    console.log(`${String(r.i).padStart(3)}  ${r.ref.padEnd(6)} ${String(r.refL).padEnd(6)}  ${r.built.padEnd(6)} ${String(r.builtL).padEnd(6)}  ${r.ok ? "" : "<-- wrong ground"}`);
  console.log(`\nground agreement ${cmp.agree}/${cmp.n} (${(cmp.ratio * 100).toFixed(0)}%)`);
  console.log(`ground crossings reference ${cmp.refCrossings}, build ${cmp.builtCrossings}`);

  if (cmp.findings.length) {
    console.log("\nFINDINGS");
    for (const f of cmp.findings) console.log(`  ${f.id}  ${f.detail}`);
    if (argv.includes("--fail")) process.exit(1);
  } else {
    console.log("\nRESULT: the build follows the reference's ground sequence.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(3); });
