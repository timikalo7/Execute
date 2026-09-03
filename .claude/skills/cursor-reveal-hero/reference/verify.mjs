#!/usr/bin/env node
/**
 * Proof that the cursor-reveal hero actually reveals — by driving a real browser and reading real
 * pixels, not by reading the CSS and believing it.
 *
 *   node verify.mjs            run the checks
 *
 * It asserts three things, in this order, because the third is the one that makes the first two
 * worth anything:
 *
 *   1. At rest the reveal sits at its designed anchor (blue showing there, red in the corner).
 *   2. After the pointer moves, the reveal is under the pointer AND has left the anchor.
 *   3. A DELIBERATELY BROKEN copy — mask pinned to a fixed position, ignoring the custom properties,
 *      which is exactly what a typo in the radial-gradient produces — FAILS check 2.
 *
 * Without (3) this file is a check that has only ever been seen to pass, which is not a check.
 *
 * Playwright is not a dependency of this repo root; the script finds the copy installed under
 * Pass an explicit one with PLAYWRIGHT_FROM=/path/to/node_modules/playwright.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(HERE, "cursor-reveal.html")).href;

const RED = [176, 0, 32];   // the base layer  (#b00020)
const BLUE = [0, 71, 171];  // the alive layer (#0047ab)

const candidates = [
  process.env.PLAYWRIGHT_FROM,
  "playwright",
].filter(Boolean);

let chromium;
for (const c of candidates) {
  try {
    // playwright is CommonJS, so an ESM `import()` of it exposes everything under `default` and the
    // named export is undefined. Destructuring straight off the namespace silently yields undefined
    // and looks exactly like "not installed" — check both shapes.
    const mod = await import(c.startsWith("/") ? pathToFileURL(c).href : c);
    chromium = mod.chromium || mod.default?.chromium;
    if (chromium) break;
  } catch { /* try the next one */ }
}
if (!chromium) {
  console.error("verify: playwright not found. Tried:\n  " + candidates.join("\n  "));
  console.error("This is NOT a pass — the check did not run.");
  process.exit(2);
}

/** Decode a PNG the only dependency-free way available: let the browser do it. */
async function sampler(ctx, png) {
  const page = await ctx.newPage();
  await page.setContent("<canvas id=c></canvas>");
  await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.getElementById("c");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
  }, png.toString("base64"));
  return {
    at: (x, y) => page.evaluate(([x, y]) => {
      const d = document.getElementById("c").getContext("2d").getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [x, y]),
    close: () => page.close(),
  };
}

const near = (got, want, tol = 26) => want.every((w, i) => Math.abs(got[i] - w) <= tol);
const show = (c) => `rgb(${c.join(",")})`;

/**
 * Run the whole assertion set against the page, optionally after breaking it.
 * Returns a list of {name, ok, detail} — it never throws on a failed assertion, because the broken
 * run is SUPPOSED to fail and the caller needs to see that as data.
 */
async function run(ctx, { breakIt = false } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(PAGE);

  if (breakIt) {
    // The bug this models: the gradient is written with literal values instead of the custom
    // properties, so it looks perfect on the designer's screen and never moves.
    await page.addStyleTag({
      content: `.reveal-hero__alive {
        -webkit-mask-image: radial-gradient(circle 160px at 50% 45%, #000 0 55%, transparent 100%) !important;
                mask-image: radial-gradient(circle 160px at 50% 45%, #000 0 55%, transparent 100%) !important;
      }`,
    });
  }

  const box = await page.locator(".reveal-hero").boundingBox();
  const anchor = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 };
  const moved = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.25 };
  const corner = { x: box.x + 12, y: box.y + box.height - 12 };
  const rel = (p) => [Math.round(p.x - box.x), Math.round(p.y - box.y)];

  const out = [];

  // ---- 1. at rest
  let s = await sampler(ctx, await page.locator(".reveal-hero").screenshot());
  let atAnchor = await s.at(...rel(anchor));
  let atCorner = await s.at(...rel(corner));
  await s.close();
  out.push({
    name: "at rest, the reveal sits at the designed anchor",
    ok: near(atAnchor, BLUE) && near(atCorner, RED),
    detail: `anchor ${show(atAnchor)} (want blue), corner ${show(atCorner)} (want red)`,
  });

  // ---- 2. follows the pointer
  await page.mouse.move(moved.x, moved.y, { steps: 12 });
  // The easing runs for a few frames after the last event; give it time to settle rather than
  // racing it, or a pass/fail depends on machine speed.
  await page.waitForTimeout(600);

  s = await sampler(ctx, await page.locator(".reveal-hero").screenshot());
  const underPointer = await s.at(...rel(moved));
  const vacated = await s.at(...rel(anchor));
  await s.close();
  out.push({
    name: "the reveal moves to the pointer",
    ok: near(underPointer, BLUE),
    detail: `under pointer ${show(underPointer)} (want blue)`,
  });
  out.push({
    name: "and leaves the place it came from",
    ok: near(vacated, RED),
    detail: `old anchor ${show(vacated)} (want red again)`,
  });

  await page.close();
  return out;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });

console.log("GOOD PAGE — every check must pass");
const good = await run(ctx);
for (const r of good) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);

console.log("\nBROKEN PAGE — mask pinned to a literal position; the tracking checks MUST fail");
const bad = await run(ctx, { breakIt: true });
for (const r of bad) console.log(`  ${r.ok ? "pass" : "fail"}  ${r.name}\n        ${r.detail}`);

await ctx.close();
await browser.close();

const goodOk = good.every((r) => r.ok);
// On the broken page the two tracking checks must fail. If they still pass, the checks are not
// measuring what they claim to and the whole file is decoration.
const trackingDetected = bad.slice(1).some((r) => !r.ok);

console.log("");
if (!goodOk) console.log("RESULT: FAIL — the reference implementation does not reveal correctly.");
else if (!trackingDetected) console.log("RESULT: FAIL — the checks passed a page whose mask cannot move. They prove nothing.");
else console.log("RESULT: PASS — reveal tracks the pointer, and the check is proven to catch a mask that does not.");

fs.writeFileSync(
  path.join(HERE, "last-run.txt"),
  `${new Date().toISOString()}  good=${goodOk} catches-broken=${trackingDetected}\n`
);
process.exit(goodOk && trackingDetected ? 0 : 1);
