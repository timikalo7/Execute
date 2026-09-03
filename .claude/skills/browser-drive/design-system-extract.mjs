#!/usr/bin/env node
/**
 * design-system-extract — read a reference site's ACTUAL design system out of its DOM, in one pass.
 *
 * WHY THIS EXISTS. A clone of one page took twelve iterations and several days. The single largest
 * cause was not difficulty: **the reference's source was never read.** The site is reachable — curl
 * returns 419KB of HTML — and its real type scale, colour tokens, spacing rhythm, section boundaries
 * and scroll mechanics are all in there. Instead every one of those was INFERRED FROM SCREENSHOTS,
 * one metric per iteration: measure ink, brief an agent, rebuild, measure again. Pixels were treated
 * as the only available evidence while the DOM sat one command away.
 *
 * A screenshot tells you what a page looks like. The DOM tells you what it IS. Guessing a type scale
 * from rendered glyphs takes iterations and lands近; reading `font-size` off the element takes
 * milliseconds and lands exact.
 *
 * So: load the page, walk the rendered DOM, and report the system rather than the picture —
 *   - TYPE      every distinct size/weight/family/tracking actually in use, by frequency
 *   - COLOUR    every distinct text, background and border colour, by frequency
 *   - SPACING   the section rhythm — where sections start and how tall they are
 *   - MOTION    elements carrying transform/transition/animation, and what drives them
 *   - STRUCTURE the section outline, so the clone starts from the right sequence
 *
 * Chromium here cannot reach the internet, so requests are served from Node — the same transport as
 * interaction-capture.mjs. Media and fonts are aborted: a progress-gated preloader will otherwise
 * never finish, which is measured behaviour on the site that motivated this file.
 *
 *   node design-system-extract.mjs <url> [--out tokens.json] [--viewport 1440x900]
 *   node design-system-extract.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function resolveChromium() {
  const anchors = [];
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    anchors.push(path.join(d, "package.json"));
    if (d === path.dirname(d)) break;
  }
  const here = path.dirname(new URL(import.meta.url).pathname);
  const projects = path.resolve(here, "../../..", "projects");
  if (fs.existsSync(projects))
    for (const p of fs.readdirSync(projects)) anchors.push(path.join(projects, p, "package.json"));
  for (const g of ["/opt/node22/lib/node_modules", "/usr/lib/node_modules"]) anchors.push(path.join(g, "x.js"));
  for (const a of anchors) { try { return createRequire(a)("playwright").chromium; } catch {} }
  return null;
}

export const STRIP_HEADERS = ["content-encoding", "content-length", "content-security-policy",
  "content-security-policy-report-only", "x-frame-options"];
export const cleanHeaders = (h) => Object.fromEntries(
  Object.entries(h || {}).filter(([k]) => !STRIP_HEADERS.includes(k.toLowerCase())));

/** Sort a {value: count} map into the most-used first, keeping only what is actually used. */
export function rank(counts, min = 1) {
  return Object.entries(counts)
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([value, n]) => ({ value, n }));
}

/**
 * A type SCALE is the distinct sizes in use, largest first, with the ratio between neighbours —
 * which is what tells you whether a page is on a modular scale and what its step is.
 */
export function typeScale(sizes) {
  const px = [...new Set(sizes.map((s) => parseFloat(s)))].filter((n) => n > 0).sort((a, b) => b - a);
  return px.map((size, i) => ({
    px: size,
    ratioToNext: i < px.length - 1 ? +(size / px[i + 1]).toFixed(3) : null,
  }));
}

/** Runs in the page. Everything here is measured off the rendered DOM, never guessed. */
const EXTRACT = () => {
  const text = {}, bg = {}, border = {}, fam = {}, size = {}, weight = {}, track = {}, radius = {};
  const bump = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
  const meaningful = (el) => {
    const t = (el.textContent || "").trim();
    return t.length > 0 && t.length < 400 && el.children.length === 0;
  };

  const motion = [];
  const all = document.querySelectorAll("body *");
  for (const el of all) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    if (meaningful(el)) {
      bump(text, cs.color);
      bump(fam, cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      bump(size, cs.fontSize);
      bump(weight, cs.fontWeight);
      if (cs.letterSpacing !== "normal") bump(track, cs.letterSpacing);
    }
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") bump(bg, cs.backgroundColor);
    if (cs.borderTopWidth !== "0px" && cs.borderTopColor) bump(border, cs.borderTopColor);
    if (cs.borderRadius !== "0px") bump(radius, cs.borderRadius);

    const hasTransform = cs.transform && cs.transform !== "none";
    const hasTransition = cs.transitionDuration && cs.transitionDuration !== "0s";
    const hasAnim = cs.animationName && cs.animationName !== "none";
    const sticky = cs.position === "sticky" || cs.position === "fixed";
    if (hasTransform || hasAnim || sticky) {
      motion.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 60)) || "",
        position: cs.position,
        transform: hasTransform ? cs.transform.slice(0, 60) : null,
        animation: hasAnim ? cs.animationName : null,
        transition: hasTransition ? cs.transitionProperty.slice(0, 40) : null,
        willChange: cs.willChange !== "auto" ? cs.willChange : null,
      });
    }
  }

  // Section rhythm: direct children of the main scroll container, with their heights in viewports.
  const host = document.querySelector("main") || document.body;
  const vh = window.innerHeight;
  const sections = [...host.children].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className && String(el.className).slice(0, 50)) || "",
      heightPx: Math.round(r.height),
      heightVh: +(r.height / vh).toFixed(2),
      background: cs.backgroundColor,
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70),
    };
  }).filter((s) => s.heightPx > 40);

  return {
    scrollHeight: document.documentElement.scrollHeight,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    type: { family: fam, size, weight, tracking: track },
    colour: { text, background: bg, border },
    radius,
    sections,
    motion: motion.slice(0, 120),
  };
};

function selftest() {
  const checks = [];
  const t = (n, c) => checks.push({ n, ok: !!c });
  t("strips the headers that break a rehosted response",
    !("content-encoding" in cleanHeaders({ "content-encoding": "gzip", "content-type": "text/html" })));
  t("keeps content-type", cleanHeaders({ "content-type": "text/html" })["content-type"] === "text/html");

  const r = rank({ a: 5, b: 1, c: 9 });
  t("ranks most-used first", r[0].value === "c" && r[0].n === 9);
  t("keeps the count alongside the value", r[2].value === "b" && r[2].n === 1);
  t("a min filter drops the long tail", rank({ a: 5, b: 1 }, 2).length === 1);
  t("an empty map ranks to nothing", rank({}).length === 0);

  const sc = typeScale(["16px", "16px", "48px", "24px"]);
  t("scale is largest first", sc[0].px === 48 && sc[2].px === 16);
  t("scale deduplicates", sc.length === 3);
  t("scale reports the step between neighbours", sc[0].ratioToNext === 2);
  t("the smallest size has no next step", sc[2].ratioToNext === null);
  t("scale ignores zero and junk", typeScale(["0px", "normal", "12px"]).length === 1);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.n}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length ? 1 : 0;
}

const argv = process.argv.slice(2);
if (argv.includes("--selftest")) process.exit(selftest());
const url = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
if (!url) { console.error("usage: design-system-extract.mjs <url> [--out tokens.json] [--viewport WxH]"); process.exit(2); }
const [width, height] = arg("--viewport", "1440x900").split("x").map(Number);

const chromium = resolveChromium();
if (!chromium) { console.error("NOT CHECKED — playwright is not resolvable"); process.exit(4); }
const exe = fs.existsSync("/opt/pw-browsers")
  ? fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium"))
      .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p))
  : undefined;

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width, height } });
await page.route("**/*", async (route) => {
  const req = route.request();
  if (["media", "font"].includes(req.resourceType())) { try { await route.abort(); } catch {} return; }
  try {
    const res = await fetch(req.url(), {
      method: req.method(),
      headers: { ...req.headers(), "accept-encoding": "identity" },
      body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer(),
      redirect: "follow",
    });
    await route.fulfill({ status: res.status, headers: cleanHeaders(Object.fromEntries(res.headers)),
      body: Buffer.from(await res.arrayBuffer()) });
  } catch { try { await route.abort(); } catch {} }
});

let raw;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  // Scroll the page once so lazy sections mount before the DOM is read.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  raw = await page.evaluate(EXTRACT);
} finally {
  await browser.close();
}

const out = {
  url, capturedAt: new Date().toISOString().slice(0, 10),
  scrollHeight: raw.scrollHeight, viewport: raw.viewport,
  type: {
    families: rank(raw.type.family),
    scale: typeScale(Object.keys(raw.type.size)),
    sizesByUse: rank(raw.type.size),
    weights: rank(raw.type.weight),
    tracking: rank(raw.type.tracking),
  },
  colour: {
    text: rank(raw.colour.text, 2),
    background: rank(raw.colour.background, 2),
    border: rank(raw.colour.border, 2),
  },
  radius: rank(raw.radius),
  sections: raw.sections,
  motion: raw.motion,
};

const dest = arg("--out");
if (dest) fs.writeFileSync(dest, JSON.stringify(out, null, 2));

console.log(`\n${url}  —  ${out.scrollHeight}px tall, ${out.sections.length} top-level sections\n`);
console.log("TYPE FAMILIES:", out.type.families.slice(0, 4).map((f) => `${f.value} (${f.n})`).join(", "));
console.log("TYPE SCALE   :", out.type.scale.slice(0, 10).map((s) => `${s.px}px`).join(" · "));
console.log("WEIGHTS      :", out.type.weights.map((w) => `${w.value}(${w.n})`).join(" "));
console.log("TEXT COLOURS :", out.colour.text.slice(0, 6).map((c) => `${c.value}(${c.n})`).join(" "));
console.log("BACKGROUNDS  :", out.colour.background.slice(0, 6).map((c) => `${c.value}(${c.n})`).join(" "));
console.log(`MOTION       : ${out.motion.length} elements carrying transform/animation/sticky`);
console.log("\nSECTIONS (height in viewports):");
for (const s of out.sections.slice(0, 20))
  console.log(`  ${String(s.heightVh).padStart(6)}vh  ${s.background.padEnd(22)} ${s.text.slice(0, 46)}`);
if (dest) console.log(`\nwritten to ${dest}`);
