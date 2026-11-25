#!/usr/bin/env node
/**
 * NORMAL-CV — your own non-technical CV, checked the same way the generated ones are.
 *
 * Optional. If you do shift or agency work, you may have a hand-made CV for it. Nothing in this repo
 * generates that file, which is exactly why it needs this: every generated CV is re-opened, its text
 * extracted and audited before it ships, and a hand-made PDF that skips that check would be the one
 * attachment nobody has proven an applicant tracking system can read.
 *
 * Where it lives comes from your profile: `cv_files.normal_pdf` (default
 * `profile/cv/<Your-Name>-CV-Normal.pdf`). Both it and the extracted text are gitignored.
 *
 * So this does two things:
 *
 *   1. EXTRACTS the text back out of the PDF and writes it next to it as `.txt`. That file is
 *      DERIVED, never typed — it is what a parser sees, so tailor.mjs can show it in the pack as
 *      cv.md and the pack cannot claim something the attachment does not say.
 *   2. AUDITS it with the same auditText() the generated CVs go through: name, email, institution,
 *      plus every string in `cv_files.normal_must_include` (default: your non-technical job titles).
 *      A CV exported as an image passes every visual review and parses as an empty document.
 *
 *   node scripts/normal-cv.mjs              extract + audit + write the .txt
 *   node scripts/normal-cv.mjs --self-test  prove the audit FAILS on an unreadable CV (fictional data)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditText, pdfText, renderOne } from "./render-pdf.mjs";
import { exitIfNoBrowser, launchBrowser, loadExample, loadProfile, normalCvPaths } from "./profile.mjs";

const ROOT = process.cwd();

/** Extra strings that must survive extraction — the non-technical CV's whole reason for existing. */
export function mustIncludeFor(profile) {
  const declared = profile.cv_files?.normal_must_include;
  if (Array.isArray(declared) && declared.length) return declared;
  return (profile.experience_non_technical?.items || []).map((e) => e.title).filter(Boolean).slice(0, 3);
}

export async function extract(profile, { root = ROOT, pdfPath = null } = {}) {
  const rel = pdfPath || normalCvPaths(profile).pdf;
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  if (!fs.existsSync(abs)) {
    return { ok: false, why: `${rel} is not there — reported as NOT-CHECKED, not as a pass` };
  }
  const { text, numPages } = await pdfText(fs.readFileSync(abs));
  const audit = auditText(text, { profile, mustInclude: mustIncludeFor(profile) });
  return { ok: audit.ok, missing: audit.missing, text, numPages };
}

/**
 * A fictional non-technical CV for the example profile, printed through a browser — so the self-test
 * exercises the real extract-and-audit path on a real PDF without anyone's real CV being present.
 */
function fixtureCvHtml(profile) {
  const id = profile.identity;
  const items = profile.experience_non_technical?.items || [];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html><meta charset="utf-8"><title>CV</title>
<h1>${esc(id.name)}</h1><p>${esc(id.email)} | ${esc(id.phone)}</p>
<h2>Education</h2><p>${esc(profile.education[0].institution)}</p>
<h2>Experience</h2>${items
    .map((e) => `<h3>${esc(e.title)} — ${esc(e.organisation)}</h3><ul>${(e.achievements || []).map((a) => `<li>${esc(a.claim)}</li>`).join("")}</ul>`)
    .join("")}`;
}

async function selfTest() {
  let failed = 0;
  const say = (ok, name, detail) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` → ${detail}` : ""}`);
    if (!ok) failed++;
  };
  const profile = loadExample();
  const must = mustIncludeFor(profile);

  // A real PDF, printed from fictional data, extracted and audited by the shipped code path.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "normalcv-selftest-"));
  const pdfPath = path.join(tmp, "Alex-Example-CV-Normal.pdf");
  const browser = await launchBrowser().catch(exitIfNoBrowser);
  try {
    const page = await browser.newPage();
    await renderOne(page, fixtureCvHtml(profile), pdfPath);
  } finally {
    await browser.close();
  }
  const res = await extract(profile, { pdfPath });
  say(res.ok === true, "a readable non-technical CV extracts and audits", res.ok ? `${res.numPages} page(s)` : `missing ${(res.missing || []).join(", ")}`);

  const absent = await extract(profile, { pdfPath: path.join(tmp, "missing.pdf") });
  say(absent.ok === false && /NOT-CHECKED/.test(absent.why), "a CV that is not there is NOT-CHECKED, never a pass", absent.why);
  fs.rmSync(tmp, { recursive: true, force: true });

  // The direction that matters. A check only ever seen to pass is not a check.
  const blank = auditText("", { profile, mustInclude: must });
  say(blank.ok === false, "an empty extraction is caught", `missing ${blank.missing.length} thing(s)`);

  const contactOnly = auditText(
    `${profile.identity.name} ${profile.identity.email} ${profile.education[0].institution}`,
    { profile, mustInclude: must },
  );
  say(
    contactOnly.ok === false,
    "a CV with the contact details but none of the work history is caught",
    `missing ${contactOnly.missing.join(", ")}`,
  );

  say(must.length > 0, "the must-include list comes from the profile, not from this file", JSON.stringify(must));

  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — the audit fails on an unreadable CV and passes on a readable one");
  process.exit(failed ? 1 : 0);
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const profile = loadProfile();
  const { txt } = normalCvPaths(profile);
  const res = await extract(profile);
  if (!res.ok) {
    console.error(`normal-cv: ${res.why || `extraction is missing ${res.missing.join(", ")}`}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, txt), res.text.replace(/\n{3,}/g, "\n\n").trim() + "\n");
  console.log(`normal-cv: ${res.numPages} page(s), text extracted and audited → ${txt}`);
}

if (process.argv[1] && process.argv[1].endsWith("normal-cv.mjs")) main();
