#!/usr/bin/env node
/**
 * RENDER-PDF — turns each tailored cv.html into the file you actually upload.
 *
 * A CV shown as text on a web page cannot be attached to an application. This step is the difference
 * between "here is what your CV would say" and "here is your CV".
 *
 * It does three things, and the third is the one that matters:
 *
 *   1. PRINTS  each output/<slug>/cv.html through headless Chromium to A4, fonts embedded.
 *   2. FITS    the layout onto ONE page by walking a tightening ladder (FIT_STEPS in cv-html.mjs)
 *              and letting the browser measure each attempt. A student CV is one page, so a
 *              two-page result is a bug, not a variant.
 *   3. SKIPS   any CV whose content has not changed since the last render (hash in .cvhash). Chromium
 *              stamps a fresh /CreationDate into every PDF, so re-rendering an unchanged CV would
 *              produce a byte-different file, and the daily job would commit ~1 MB of identical PDFs
 *              every morning forever.
 *   4. PROVES  the text comes back OUT. Most of these applications are read by an ATS before a human
 *              sees them, and a beautiful PDF whose text does not extract is a CV that gets parsed as
 *              empty. So every rendered PDF is re-opened, its text extracted, and checked for your
 *              name, email, institution and at least one achievement. A PDF that fails this
 *              is deleted rather than shipped — a missing file is a visible problem, an unreadable
 *              one is an invisible rejection.
 *
 *   node scripts/render-pdf.mjs              render everything that changed
 *   node scripts/render-pdf.mjs --all        re-render regardless of hash
 *   node scripts/render-pdf.mjs --self-test  prove the extraction check FAILS on bad input
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { assess } from "./eligibility.mjs";
import { FIT_STEPS, cvHtml, cvMarkdown } from "./cv-html.mjs";
import { cvVariantFor, loadFound, pdfNameFor, slugFor } from "./tailor.mjs";
import { chromiumOptions, loadExample, loadProfile } from "./profile.mjs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "output");

/** Extract every text run from a PDF, in paint order, as one string per page. */
export async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false })
    .promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    // A line break in the PDF is a separate item with hasEOL. Joining those without a separator
    // welds the last word of one line to the first of the next ("entering thirdyear"), which would
    // make any check that spans a line break fail for a reason that has nothing to do with the CV.
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join(""));
  }
  await doc.destroy();
  return { pages, text: pages.join("\n"), numPages: doc.numPages };
}

/**
 * The assertions an ATS effectively makes. Kept to things that must be true of ANY version of this
 * CV, so the check does not need updating every time the profile changes.
 */
export function auditText(text, { profile, mustInclude = [] }) {
  const flat = text.replace(/\s+/g, " ").toLowerCase();
  const need = [
    ["name", profile.identity?.name],
    ["email", profile.identity?.email],
    ["institution", profile.education?.[0]?.institution],
    ...mustInclude.map((m) => ["claim", m]),
  ];
  const missing = need.filter(([, v]) => !flat.includes(String(v).replace(/\s+/g, " ").toLowerCase()));
  return { ok: missing.length === 0, missing: missing.map(([k, v]) => `${k}: ${JSON.stringify(v)}`) };
}

export async function renderOne(page, html, pdfPath) {
  await page.setContent(html, { waitUntil: "load" });
  // Fonts arrive as base64 in the stylesheet, but "load" does not wait for them to be parsed and
  // applied. Printing early silently falls back to a system serif — the exact failure this project
  // vendored fonts to avoid.
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
}

// ------------------------------------------------------------------ self-test
// A check only ever shown passing is not proven to work. Three controls: a real CV must pass, a CV
// missing its own contact details must fail, and — the one that matters — a CV whose text is baked
// into an image must fail, because that is what a "designed" CV looks like when it is unreadable.
async function selfTest() {
  // The FICTIONAL example profile: a self-test never reads your data.
  const profile = loadExample();
  const name = profile.identity.name;
  const email = profile.identity.email;
  const inst = profile.education[0].institution;

  const realText = `<p>${name}</p><p>${email}</p><p>${inst}</p>`;
  // Painted into a canvas, so it reaches the PDF as a bitmap. This is the real-world failure: a CV
  // exported as an image looks perfect on screen and parses as an empty document.
  const raster = `<!doctype html><meta charset="utf-8"><canvas id="c" width="600" height="120"></canvas>
    <script>
      const x = document.getElementById("c").getContext("2d");
      x.fillStyle = "#000"; x.font = "20px serif";
      ${JSON.stringify([name, email, inst])}.forEach((s, i) => x.fillText(s, 10, 40 + i * 30));
    </script>`;

  const cases = [
    { name: "a CV with real text passes", html: `<!doctype html><meta charset="utf-8">${realText}`, expectOk: true },
    { name: "a CV missing its contact details is caught", html: `<!doctype html><meta charset="utf-8"><p>${name}</p>`, expectOk: false },
    { name: "a CV whose text is a bitmap is caught", html: raster, expectOk: false },
  ];

  const browser = await chromium.launch(chromiumOptions());
  const page = await browser.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cvselftest-"));
  let failed = 0;
  for (const c of cases) {
    const p = path.join(tmp, "t.pdf");
    await renderOne(page, c.html, p);
    const { text } = await pdfText(fs.readFileSync(p));
    const audit = auditText(text, { profile });
    const ok = audit.ok === c.expectOk;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.name} → extraction ${audit.ok ? "found everything" : "missing " + audit.missing.join(", ")}`,
    );
    if (!ok) failed++;
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(
    failed
      ? `\nself-test FAILED (${failed})`
      : "\nself-test passed — the ATS check fails on an unreadable CV and passes on a readable one",
  );
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------ main
async function run() {
  const all = process.argv.includes("--all");
  const profile = loadProfile();
  const found = loadFound();
  const fontDir = path.join(ROOT, "assets", "fonts");

  for (const j of found.jobs) if (!j.eligibility) j.eligibility = assess(j, { profile });
  const items = found.jobs.filter((j) => j.eligibility.verdict !== "ineligible");
  if (!items.length) {
    console.error("render-pdf: nothing eligible to render (reported as NOT-CHECKED, not as a pass)");
    process.exit(2);
  }

  const browser = await chromium.launch(chromiumOptions());
  const page = await browser.newPage();
  let rendered = 0;
  let skipped = 0;
  const broken = [];
  const tightened = [];

  let verbatim = 0;
  for (const item of items) {
    // Packs that ship your own non-technical CV have nothing to render — tailor.mjs already copied
    // the file in. Rendering one anyway would overwrite your PDF with a generated one,
    // which is the single worst thing this script could do, so it is skipped by name rather than by
    // a hash that happens not to match.
    if (cvVariantFor(item) === "normal") {
      const at = path.join(ROOT, "output", slugFor(item), pdfNameFor(item));
      if (!fs.existsSync(at)) {
        console.error(`render-pdf: ${slugFor(item)} wants the non-technical CV but it is not in the folder — run node scripts/tailor.mjs`);
        process.exit(2);
      }
      verbatim++;
      continue;
    }
    const dir = path.join(ROOT, "output", slugFor(item));
    fs.mkdirSync(dir, { recursive: true });
    const pdfName = pdfNameFor(item);
    const pdfPath = path.join(dir, pdfName);
    const hashFile = path.join(dir, ".cvhash");

    // Hash the UNFITTED layout: it is a pure function of the profile and the posting, so it changes
    // exactly when the CV's content should change. Chromium stamps a fresh /CreationDate into every
    // PDF, so without this the daily job would commit a byte-different set of identical CVs forever.
    const base = cvHtml(profile, item, { fontDir, fit: FIT_STEPS[0] });
    const hash = crypto.createHash("sha256").update(base).digest("hex");
    if (!all && fs.existsSync(pdfPath) && fs.existsSync(hashFile) && fs.readFileSync(hashFile, "utf8").trim() === hash) {
      skipped++;
      continue;
    }
    // A renamed company leaves the old file behind, and a stale CV for a role you already applied to
    // is exactly the file you would attach by accident.
    for (const stale of fs.readdirSync(dir)) if (stale.endsWith(".pdf") && stale !== pdfName) fs.rmSync(path.join(dir, stale));

    // ONE PAGE IS A REQUIREMENT, not a preference. Rather than guess at a font size that fits every
    // posting, walk a tightening ladder and let the browser measure. The first step that fits is the
    // one that ships.
    let used = null;
    let numPages = 0;
    for (const fit of FIT_STEPS) {
      const html = cvHtml(profile, item, { fontDir, fit });
      await renderOne(page, html, pdfPath);
      ({ numPages } = await pdfText(fs.readFileSync(pdfPath)));
      if (numPages === 1) {
        used = fit;
        fs.writeFileSync(path.join(dir, "cv.html"), html);
        // The words on screen must be the words in the file, so the markdown follows the same fit.
        fs.writeFileSync(path.join(dir, "cv.md"), cvMarkdown(profile, item, { fit }));
        break;
      }
    }
    if (!used) {
      fs.rmSync(pdfPath, { force: true });
      fs.rmSync(hashFile, { force: true });
      broken.push(`${slugFor(item)} — still ${numPages} pages at the tightest setting`);
      continue;
    }
    if (used !== FIT_STEPS[0]) tightened.push(`${slugFor(item)} → ${used.note}`);

    // The first achievement on the page is the strongest claim this CV makes. If that did not make
    // it into the extracted text, the layout is eating content and no ATS will see it either.
    const html = fs.readFileSync(path.join(dir, "cv.html"), "utf8");
    // Taken from the HTML, so entities have to come back to characters first — otherwise the check
    // hunts the PDF for a literal "&amp;" and fails every CV for a reason that is not about the CV.
    const firstClaim = ((html.match(/<li>([^<]{25,120})/) || [])[1] || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const { text } = await pdfText(fs.readFileSync(pdfPath));
    const audit = auditText(text, { profile, mustInclude: firstClaim ? [firstClaim.slice(0, 60)] : [] });
    if (!audit.ok) {
      fs.rmSync(pdfPath, { force: true });
      fs.rmSync(hashFile, { force: true });
      broken.push(`${slugFor(item)} — ${audit.missing.join("; ")}`);
      continue;
    }

    fs.writeFileSync(hashFile, hash + "\n");
    rendered++;
    console.log(`  ${pdfName} — 1 page, text verified${used === FIT_STEPS[0] ? "" : ` (${used.note})`}`);
  }

  await browser.close();
  console.log(
    `\nrendered ${rendered} · unchanged ${skipped} · rejected ${broken.length}` +
      (verbatim ? ` · ${verbatim} shipped the non-technical CV verbatim (not generated, not overwritten)` : ""),
  );
  if (tightened.length) console.log(`tightened to fit one page: ${tightened.length}`);
  if (broken.length) {
    console.error("\nthese PDFs were DELETED rather than shipped:");
    for (const b of broken) console.error(`  ${b}`);
    process.exit(1);
  }
}

// Guarded on BOTH branches, not just the self-test one. Without the `else if`, `import { pdfText }
// from "./render-pdf.mjs"` launched Chromium and re-rendered the entire board as a side effect of
// importing a text-extraction helper. This is the third file in this project to hit "library and
// command in one file" (ground-check.mjs records the first two); the rule is that the command half
// only runs when process.argv[1] is this file.
const isMain = process.argv[1] && process.argv[1].endsWith("render-pdf.mjs");
if (isMain && process.argv.includes("--self-test")) await selfTest();
else if (isMain) await run();
