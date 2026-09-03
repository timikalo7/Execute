#!/usr/bin/env node
/**
 * external-site — open, drive and RECORD a public website from this container.
 *
 * The problem it solves: Chromium here cannot open an external HTTPS connection. The agent proxy
 * never even sees a CONNECT, so it is blocked below anything the browser can be configured to do —
 * four proxy configurations were tried and every one returned `ERR_CONNECTION_RESET`, including on
 * example.com. For a while that was recorded as "reference sites cannot be visited", which was a
 * true observation turned into a false law.
 *
 * Node's `fetch` reaches the same sites fine. And Playwright's `route` handler runs in NODE, not in
 * the page. So every request the browser makes is intercepted, performed by Node, and fulfilled
 * back into the browser. The page is entirely real — its HTML, CSS, JS, fonts and images are the
 * ones the server sent. Only the transport is borrowed.
 *
 * Proven 2026-08-28 on unitedcarriers.com: 404 requests served, 0 failed, a 28,229px page rendered
 * and recorded to video with its scroll-driven scenes running.
 *
 *   node external-site.mjs <url> <out-dir> [--seconds 50] [--width 1440]
 *
 * Produces a .webm recording plus periodic screenshots. Convert to mp4 with the ffmpeg that
 * `watch-video` bundles:
 *   FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
 *   "$FF" -i out/*.webm -vf scale=1280:-2 -c:v libx264 -pix_fmt yuv420p -crf 28 out/walk.mp4
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: node external-site.mjs <url> <out-dir> [--seconds N] [--width N]");
  process.exit(2);
}
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const WIDTH = arg("--width", 1440);
const SECONDS = arg("--seconds", 50);
fs.mkdirSync(outDir, { recursive: true });

function findChromium() {
  const c = [
    process.env.PW_CHROMIUM,
    ...(fs.existsSync("/opt/pw-browsers")
      ? fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium")).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
      : []),
  ].filter((p) => p && fs.existsSync(p));
  return c[0];
}

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 900 },
  recordVideo: { dir: outDir, size: { width: WIDTH, height: 900 } },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});

let served = 0, failed = 0;
await ctx.route("**/*", async (route) => {
  const req = route.request();
  try {
    const r = await fetch(req.url(), {
      method: req.method(),
      // `identity` because fetch decodes for us; forwarding the original encoding header would
      // make the browser try to decode an already-decoded body.
      headers: { ...req.headers(), "accept-encoding": "identity" },
      body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => {
      // content-length/encoding no longer describe this body, and a CSP written for the real
      // origin will refuse the subresources we are about to fulfil.
      if (["content-encoding", "content-length", "content-security-policy", "content-security-policy-report-only"].includes(k)) return;
      headers[k] = v;
    });
    served++;
    await route.fulfill({ status: r.status, headers, body });
  } catch {
    failed++;
    try { await route.abort(); } catch { /* the page may already be gone */ }
  }
});

const page = await ctx.newPage();
console.log(`loading ${url} …`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(6000);
console.log("title:", JSON.stringify(await page.title()));

const H = await page.evaluate(() => document.documentElement.scrollHeight);
console.log("page height:", H);
await page.screenshot({ path: path.join(outDir, "shot-top.jpg"), quality: 72, type: "jpeg" });

// Drive it the way somebody evaluating the design would: settle, then move in steps slow enough for
// each transition to land, wandering the pointer so hover and cursor treatments actually fire.
await page.mouse.move(WIDTH / 2, 450);
await page.waitForTimeout(2000);
const steps = Math.max(6, Math.floor((SECONDS - 12) / 1.6));
const stride = Math.max(400, Math.floor((H - 900) / steps));
for (let i = 0; i < steps; i++) {
  await page.mouse.wheel(0, stride);
  await page.waitForTimeout(1100);
  await page.mouse.move(380 + ((i * 137) % 700), 280 + ((i * 91) % 380));
  await page.waitForTimeout(500);
  if (i % 3 === 0) await page.screenshot({ path: path.join(outDir, `shot-${String(i).padStart(2, "0")}.jpg`), quality: 72, type: "jpeg" });
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await page.waitForTimeout(3500);

console.log(`requests served via Node: ${served}, failed: ${failed}`);
await ctx.close();
await browser.close();
console.log(`recording + screenshots in ${outDir}`);
