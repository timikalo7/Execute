#!/usr/bin/env node
/**
 * PROVE-EDGE — the shipped filler, through a REAL installed browser, all the way to the last page of
 * a multi-page form, and proven NOT to submit.
 *
 * `prove.mjs` runs Playwright's bundled Chromium on single-page forms. This runs the same shipped code
 * (rules, scan, fillPage, isNextControl, wouldSubmit from apply.mjs), but:
 *
 *   1. THROUGH A REAL INSTALLED BROWSER — Microsoft Edge by default (`--browser=chrome` for Chrome),
 *      started with --remote-debugging-port and reached with connectOverCDP. That is the path
 *      apply.cmd takes on Windows, not an approximation of it. The version it ran is recorded.
 *   2. ALL THE WAY THROUGH A MULTI-PAGE FORM — page 1 → Next → page 2 → Save and continue → page 3,
 *      with a screenshot of every page. On the last page it FINDS the submit control and does not
 *      press it, and the run asserts the form never fired.
 *
 * Writes proof/edge-*.png and proof/EDGE-REPORT.md (proof/ is gitignored). Uses your profile.
 *
 *   node scripts/prove-edge.mjs [--browser=chrome] [--slug=<slug>]
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { rules, scan, fillPage, wouldSubmit, isNextControl } from "./apply.mjs";
import { answerBlocks } from "./answers.mjs";
import { loadFound, pdfNameFor, slugFor } from "./tailor.mjs";
import { cdpPort, loadProfile } from "./profile.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "proof");
const FIXTURES = path.join(ROOT, "scripts", "fixtures");

const serve = (dir) =>
  new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const f = path.join(dir, path.basename(req.url.split("?")[0]));
      if (!fs.existsSync(f)) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, base: `http://127.0.0.1:${s.address().port}` }));
  });

/** Same scan-and-match the real walk uses, for whichever control kind we are after. */
async function findControl(page, predicate) {
  const c = await page.$$eval('button, a, input[type="submit"], input[type="button"], [role="button"]', (els) =>
    els.map((el, i) => {
      el.setAttribute("data-pv", String(i));
      const r = el.getBoundingClientRect();
      return {
        i,
        visible: r.width > 0 && r.height > 0,
        text: [el.innerText, el.value, el.getAttribute("aria-label"), el.name, el.id].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      };
    }),
  );
  const hit = c.find((x) => x.visible && predicate(x.text));
  return hit ? { text: hit.text, sel: `[data-pv="${hit.i}"]` } : null;
}

/** Walk the wizard, filling every page. Stops on the last page; never presses submit. */
async function walk(page, base, { profile, item, docs, pdf, label }) {
  const pages = [];
  await page.goto(`${base}/wizard-like.html`, { waitUntil: "domcontentloaded" });
  for (let n = 1; n <= 6; n++) {
    const fields = await scan(page);
    const { filled, skipped } = await fillPage(page, fields, rules(profile, item, docs), pdf);
    await page.screenshot({ path: path.join(OUT, `${label}-page${n}.png`), fullPage: true });
    pages.push({ n, filled: filled.length, left: skipped.length, values: filled.slice(0, 6) });
    const next = await findControl(page, (t) => isNextControl(t));
    if (!next) {
      const sub = await findControl(page, (t) => wouldSubmit(t));
      return { pages, submitControlSeen: sub?.text ?? null };
    }
    await page.click(next.sel);
    await page.waitForTimeout(300);
  }
  return { pages, submitControlSeen: null };
}

async function main() {
  const profile = loadProfile();
  const found = loadFound();
  fs.mkdirSync(OUT, { recursive: true });
  const pick = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
  const channel = (process.argv.find((a) => a.startsWith("--browser=")) || "").split("=")[1] || "msedge";

  const item = (pick && found.jobs.find((j) => slugFor(j) === pick)) || found.jobs.find((j) => (j.eligibility?.verdict ?? "check") !== "ineligible") || found.jobs[0];
  if (!item) {
    console.error("prove-edge: the board is empty — run `npm run daily` first");
    process.exit(2);
  }
  const docs = answerBlocks(profile, item);
  const pdfPath = path.join(ROOT, "output", slugFor(item), pdfNameFor(item, profile));
  const pdf = fs.existsSync(pdfPath) ? pdfPath : null;

  const { server, base } = await serve(FIXTURES);
  const port = await cdpPort();

  // 1. A REAL installed browser, started with a debugging port — what apply.cmd does on Windows.
  let real;
  try {
    real = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "edge-prof-")), {
      channel,
      headless: true,
      args: [`--remote-debugging-port=${port}`, "--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    });
  } catch (e) {
    server.close();
    console.error(`prove-edge: could not start ${channel} — ${String(e.message).split("\n")[0]}`);
    console.error(`            This proof needs an installed browser. Try --browser=chrome. Reported as NOT-CHECKED.`);
    process.exit(2);
  }

  // 2. ATTACH to it over CDP, the way --attach does. Nothing below launches a browser.
  const attached = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const ctx = attached.contexts()[0];
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.setViewportSize({ width: 1280, height: 1100 });

  const version = attached.version();
  const ua = await page.evaluate("navigator.userAgent");
  const webdriver = await page.evaluate("navigator.webdriver");
  const isRealBrowser = channel === "msedge" ? /Edg\//.test(ua) : /Chrome\//.test(ua);
  console.log(`browser: ${version}\nua:      ${ua}\nreal ${channel}: ${isRealBrowser}   navigator.webdriver: ${webdriver}\n`);

  // The wizard: must reach the last page and NOT press anything.
  const a = await walk(page, base, { profile, item, docs, pdf, label: "edge-wizard" });
  const aSubmitted = await page.evaluate("window.__submitted === true");
  console.log(`wizard     : ${a.pages.length} page(s), saw submit control ${JSON.stringify(a.submitControlSeen)}, form submitted: ${aSubmitted}`);

  // The single-page Teamtailor layout: filled, submit control present, not pressed.
  await page.goto(`${base}/teamtailor-like.html`, { waitUntil: "domcontentloaded" });
  const f = await scan(page);
  const { filled } = await fillPage(page, f, rules(profile, item, docs), pdf);
  const sub = await findControl(page, (t) => wouldSubmit(t));
  await page.screenshot({ path: path.join(OUT, "edge-teamtailor.png"), fullPage: true });
  const bSubmitted = await page.evaluate("window.__submitted === true");
  console.log(`teamtailor : ${filled.length} filled, saw submit control ${JSON.stringify(sub?.text ?? null)}, form submitted: ${bSubmitted}`);

  await attached.close();
  await real.close();
  server.close();

  const ok = isRealBrowser && webdriver === false && a.pages.length >= 3 && Boolean(a.submitControlSeen) && aSubmitted === false && bSubmitted === false;

  const md = `# Proof — a real browser, attached, all the way to the last page, and NOT submitted

Generated by \`node scripts/prove-edge.mjs\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")}.

## The browser

| | |
|---|---|
| channel | \`${channel}\` |
| CDP version | \`${version}\` |
| user agent | \`${ua}\` |
| Is it the real installed browser? | **${isRealBrowser ? "yes" : "NO"}** |
| navigator.webdriver | \`${webdriver}\` |

Started with \`--remote-debugging-port=${port}\` and reached with \`connectOverCDP\` — the same path
\`apply.cmd\` takes on Windows. Nothing after the attach launches a browser.

## Going all the way through

**${a.pages.length} pages**, each filled and screenshotted:

${a.pages.map((p) => `- **page ${p.n}** — ${p.filled} filled, ${p.left} left → \`proof/edge-wizard-page${p.n}.png\`\n${p.values.map(([k, v]) => `    - ${String(k).split("|")[0].trim()} → ${String(v).slice(0, 48)}`).join("\n")}`).join("\n")}

## The submit control was found and NOT pressed

| Form | Submit control on the page | Form fired submit |
|---|---|---|
| 3-page wizard | ${JSON.stringify(a.submitControlSeen)} | **${aSubmitted}** |
| Teamtailor layout | ${JSON.stringify(sub?.text ?? null)} | **${bSubmitted}** |

## RESULT: ${ok ? "PASS" : "FAIL"}

## What is still not proven

**Whether a real employer's server accepts the application, and whether its bot check lets the browser
through.** This form is served from localhost. Those are proven the first time you run it for real —
and the submit click is always yours.
`;

  fs.writeFileSync(path.join(OUT, "EDGE-REPORT.md"), md);
  console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"}   → proof/EDGE-REPORT.md + ${a.pages.length + 1} screenshots`);
  process.exit(ok ? 0 : 1);
}

main();
