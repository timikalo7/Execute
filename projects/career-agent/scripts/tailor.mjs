#!/usr/bin/env node
/**
 * TAILOR — a per-role CV and gap analysis for everything on the board, generated overnight.
 *
 * A CV you have to ask for does not exist at 9am, so this runs as part of the daily job and writes
 * one folder per opportunity:
 *
 *   output/<slug>/cv.md       the plain version, shown inline in the dashboard and checked by ground
 *   output/<slug>/cv.html     written by render-pdf.mjs, which owns the print layout because forcing
 *                             the CV onto one page needs a browser to measure it
 *   output/<slug>/gap.md      what you have, what you don't, and what the gate could not determine
 *   output/<slug>/answers.md  the application form, written out (answers.mjs)
 *
 * Both CVs are built from the SAME selection (select.mjs), so the one on screen is the one in the
 * file. Tailoring here means SELECTING and REORDERING true things from your profile against what the
 * posting actually asks for. It does not write new claims — it cannot, because it only ever emits
 * strings that already exist in the profile. That makes it grounded by construction rather than by
 * hope, and `npm run ground` still checks the output afterwards, because a guarantee nobody verifies
 * is a belief.
 *
 *   node scripts/tailor.mjs              → output/<slug>/{meta.json,cv.md,gap.md,answers.md}
 *   node scripts/tailor.mjs --self-test  → tailors a fictional posting for the fictional example
 *                                          profile and proves the result passes `npm run ground`, and
 *                                          that one invented line makes it fail
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assess } from "./eligibility.mjs";
import { cvMarkdown } from "./cv-html.mjs";
import { answerSheet, normalSheet } from "./answers.mjs";
import { matchSkills } from "./select.mjs";
import { activeProfile, EXAMPLE_PROFILE, loadExample, loadProfile, normalCvPaths, PROJECT_ROOT, readJson } from "./profile.mjs";

const ROOT = process.cwd();

/** jobs/found.json, written by discover.mjs — or a clear instruction when it is not there yet. */
export function loadFound(root = ROOT) {
  const f = path.join(root, "jobs", "found.json");
  if (!fs.existsSync(f)) {
    console.error("career-agent: no jobs/found.json yet — run `npm run discover` first (or `npm run daily`).");
    process.exit(2);
  }
  return readJson(f);
}

/** answers/<company>.md — hand-written supplementary answers, reused across that company's roles. */
export const companySlug = (o) => String(o.company).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Which CV this opportunity gets: the tailored technical one, or your own non-technical CV.
 *
 * A row in jobs/manual.json opts in with `"cv": "normal"`. Agencies staffing hospitality and events
 * read for tills, shifts and reliability; a systems-research CV reads as someone who will leave in
 * three weeks. Nothing else about the pipeline changes — a normal-variant pack goes through the same
 * eligibility gate, the same answer-sheet structure and the same grounding check.
 *
 * DEFAULT IS TAILORED. A row that says nothing gets the tailored CV.
 */
export const cvVariantFor = (o) => (String(o?.cv || "").toLowerCase() === "normal" ? "normal" : "tailored");

export const slugFor = (o) =>
  `${o.company}-${o.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * The filename a recruiter ends up looking at in their downloads folder — your name, the company and
 * the role. It is the actual name of the file on disk, not just an HTML `download` attribute
 * (Chromium ignores that attribute for same-origin file:// links), and the role is in it because four
 * downloads from one company all called "<name>-CV-<company>.pdf" land as "(1)", "(2)", "(3)".
 */
export const pdfNameFor = (o, profile = activeProfile()) => {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9 .]/g, " ").trim().replace(/\s+/g, "-");
  return `${clean(profile.identity?.name || "CV")}-CV-${clean(o.company)}-${clean(o.title)}`.slice(0, 90).replace(/-+$/, "") + ".pdf";
};

// The heading starts with "Gaps", a word ground-check.mjs already treats as page furniture. The
// first word of a document is not read as a line start by the checker, so a heading word that is
// neither furniture nor in your profile would be reported as an invented organisation.
function buildGap(profile, item) {
  const { have, missing } = matchSkills(profile, item.description);
  const el = item.eligibility || {};
  const gaps = profile.gaps_known?.items || [];
  return `# Gaps and fit — ${item.title} at ${item.company}

**Verdict: ${el.verdict || "unknown"}**

${el.blockers?.length ? `## Blockers\n${el.blockers.map((b) => `- ${b}`).join("\n")}\n` : ""}${
    el.unclear?.length ? `## Could not determine — worth thirty seconds of your own eyes\n${el.unclear.map((u) => `- ${u}`).join("\n")}\n` : ""
  }
## What you have that they asked for
${have.length ? have.map((s) => `- ${s}`).join("\n") : "- The posting names no specific technology this profile claims."}

## What they asked for that you do not have
${missing.length ? missing.map((s) => `- ${s} — not in the profile. Say so if asked; do not imply otherwise.`).join("\n") : "- Nothing detected from the common-requirements list."}

## Standing gaps, from the profile
${gaps.length ? gaps.map((g) => `- ${g}`).join("\n") : "- None recorded. Add them to gaps_known in the profile — honest gaps make the rest believable."}

---
*Honest by design. An application that papers over a gap wastes an interview slot; one that names it
and applies anyway is a decision you get to make.*
`;
}

/**
 * The gap analysis for a non-technical pack. matchSkills() ranks a posting against the profile's
 * technical skills, so pointing it at a hospitality agency produces "you do not have Terraform" —
 * true, irrelevant, and it buries the gaps that matter. What actually blocks agency work is documents
 * and availability, so that is what this lists — read from `logistics` in your profile.
 */
function buildNormalGap(profile, item) {
  const el = item.eligibility || {};
  const log = profile.logistics || {};
  const roles = (profile.experience_non_technical?.items || []).map((e) => `- ${e.title} — ${e.organisation} (${e.start}–${e.end})`);
  const refs = (profile.referees?.items || []).filter((r) => (r.scope || "both") !== "technical");
  const refGaps = refs.flatMap((r) => {
    const missing = [];
    if (!r.phone) missing.push("phone number");
    if (/^TODO/i.test(r.position || "") || !r.position) missing.push("job title");
    if (!/^\s*given\b/i.test(String(r.consent || ""))) missing.push("their agreement — ask before listing them");
    return missing.length ? [`  - **${r.name}** (${r.organisation || "—"}) — still needs: ${missing.join(", ")}.`] : [];
  });
  return `# Gaps and fit — ${item.title} at ${item.company}

**Verdict: ${el.verdict || "unknown"}** · **CV: your non-technical one, attached in this folder**

${el.blockers?.length ? `## Blockers\n${el.blockers.map((b) => `- ${b}`).join("\n")}\n` : ""}${
    el.unclear?.length ? `## Could not determine — worth thirty seconds of your own eyes\n${el.unclear.map((u) => `- ${u}`).join("\n")}\n` : ""
  }
## What you bring to this kind of work

${roles.length ? roles.join("\n") : "- No non-technical roles in the profile yet (experience_non_technical)."}

## What is genuinely missing, and only you can fill it

${
  log.own_transport
    ? `- ~~Own transport~~ — **answered: ${log.own_transport.answer}**.`
    : "- **Own transport** — not in the profile. It decides which shifts an agency offers you."
}
- **Date of birth** — every one of these forms asks for it and it is deliberately not stored here.
  Type it on the day.
${
  !refs.length
    ? "- **A referee for this kind of work** — none on file (referees with scope non_technical or both)."
    : refGaps.length
      ? `- **Referees are on file but not complete.** Agency forms usually make every referee field mandatory:\n${refGaps.join("\n")}`
      : "- ~~Referees~~ — **complete and asked.**"
}
${
  log.background_check
    ? `- **Background check (DBS/PVG):** ${log.background_check.answer} — ${log.background_check.detail || ""}. Certificate numbers are deliberately not stored here; have yours to hand if you hold one.`
    : "- **Background check (DBS/PVG)** — not in the profile (logistics.background_check). Agencies ask at registration."
}
${
  log.licences
    ? `- **Licences / badges:** ${log.licences.answer} — ${log.licences.detail || ""}.`
    : "- **Licences / badges** (personal licence, door supervisor) — not in the profile (logistics.licences)."
}

## Deliberately NOT a gap here

The technical gaps in your profile (\`gaps_known\`) are about internships and engineering roles. None of
them is relevant to an agency registration, and listing them here would be noise pretending to be
honesty.
`;
}

/** Write one opportunity's pack into `dir`. Shared by the daily run and the self-test. */
export function writePack(profile, item, dir, { root = ROOT, companySheet = null } = {}) {
  const variant = cvVariantFor(item);
  fs.mkdirSync(dir, { recursive: true });
  // What this folder is FOR. ground-check.mjs reads it so the organisation being applied to is not
  // itself reported as an invented organisation — the slug is truncated to 60 chars and cannot be
  // trusted to carry the full name.
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        company: item.company,
        title: item.title,
        url: item.url,
        pdf: pdfNameFor(item, profile),
        // Which CV is in this folder — attaching the technical one to an agency registration is the
        // easiest mistake available here.
        cv_variant: variant,
        // Where the thing IS. A place named by the posting is not a claim about where you worked.
        location: item.location || "",
        // The employer's own vocabulary, lifted from the posting. Allowed ONLY in answers.md, never
        // in the CV (see ground-check.mjs).
        posting_terms: [
          ...new Set([...String(item.description || "").matchAll(/\b[A-Z][A-Za-z0-9+#.'-]{2,}\b/g)].map((m) => m[0])),
        ],
      },
      null,
      2,
    ) + "\n",
  );

  if (variant === "normal") {
    // The attachment is your own file, so it is COPIED rather than generated, and cv.md is the text
    // extracted back OUT of that copy (scripts/normal-cv.mjs). The pack on screen cannot claim
    // something the attached document does not say, because it is the attached document.
    const { pdf, txt } = normalCvPaths(profile);
    const src = path.join(root, pdf);
    const txtPath = path.join(root, txt);
    if (!fs.existsSync(src) || !fs.existsSync(txtPath)) {
      console.error(
        `tailor: ${slugFor(item)} asks for the non-technical CV but ${fs.existsSync(src) ? txt : pdf} is missing.\n` +
          `        Run: node scripts/normal-cv.mjs   (reported as NOT-CHECKED, not skipped quietly)`,
      );
      process.exit(2);
    }
    for (const stale of fs.readdirSync(dir)) if (stale.endsWith(".pdf") && stale !== pdfNameFor(item, profile)) fs.rmSync(path.join(dir, stale));
    fs.copyFileSync(src, path.join(dir, pdfNameFor(item, profile)));
    fs.writeFileSync(
      path.join(dir, "cv.md"),
      // No filename and no acronyms in this header: the whole of cv.md is grounding-checked, and a
      // capitalised filename token is an "invented organisation" as far as the checker is concerned.
      `# ${profile.identity.name} — non-technical CV\n\n` +
        `*Text taken back out of the attached file by \`scripts/normal-cv.mjs\`. This is what a parser\n` +
        `reads, not a re-typing of it — so this page cannot say anything the attachment does not.*\n\n` +
        `\`\`\`\n${fs.readFileSync(txtPath, "utf8").trimEnd()}\n\`\`\`\n`,
    );
    fs.writeFileSync(path.join(dir, "answers.md"), normalSheet(profile, item, { companySheet }));
    fs.writeFileSync(path.join(dir, "gap.md"), buildNormalGap(profile, item));
    return variant;
  }

  fs.writeFileSync(path.join(dir, "answers.md"), answerSheet(profile, item, { companySheet }));

  // cv.md is written here ONLY when it does not exist yet. render-pdf.mjs owns it afterwards, because
  // only render-pdf knows which tightening step actually fit on one page — it writes the markdown from
  // the SAME fit as the PDF so the words on screen are the words in the file. Writing it every time
  // made the two fight, and whichever ran last won. Content changes still propagate: render-pdf hashes
  // the unfitted HTML, so a profile edit changes the hash, re-renders, and rewrites cv.md.
  const cvMd = path.join(dir, "cv.md");
  if (!fs.existsSync(cvMd)) fs.writeFileSync(cvMd, cvMarkdown(profile, item));

  fs.writeFileSync(path.join(dir, "gap.md"), buildGap(profile, item));
  return variant;
}

function run() {
  const profile = loadProfile();
  const found = loadFound();
  // Entries stored before the eligibility gate existed carry no verdict. Defaulting those to "check"
  // would quietly reintroduce the bug the gate exists to stop, so they are assessed now.
  for (const j of found.jobs) if (!j.eligibility) j.eligibility = assess(j, { profile });
  const items = found.jobs.filter((j) => j.eligibility.verdict !== "ineligible");
  let written = 0;
  let normal = 0;
  for (const item of items) {
    // Any hand-written employer sheet (answers/<company>.md) is APPENDED rather than substituted, so
    // supplementary questions sit alongside the generic pack instead of replacing it.
    const sheetPath = path.join(ROOT, "answers", `${companySlug(item)}.md`);
    const companySheet = fs.existsSync(sheetPath) ? fs.readFileSync(sheetPath, "utf8") : null;
    const variant = writePack(profile, item, path.join(ROOT, "output", slugFor(item)), { companySheet });
    if (variant === "normal") normal++;
    written++;
  }
  console.log(
    (normal ? `${normal} pack(s) ship your non-technical CV verbatim (cv: "normal") — no CV was generated for those.\n` : "") +
      `tailored ${written} opportunit${written === 1 ? "y" : "ies"} into output/ ` +
      `(${found.jobs.length - written} skipped as ineligible — no point writing a CV for a closed intake).\n` +
      `Next: node scripts/render-pdf.mjs builds the print layout, forces it onto one page, and writes the PDF.`,
  );
}

// ------------------------------------------------------------------ self-test
// The generator and the grounding check, proven together on fictional data: a pack tailored from the
// example profile must pass `npm run ground` as shipped, and the same pack with ONE invented claim
// appended must fail it. Runs the real ground-check CLI, not a copy of its logic.
function selfTest() {
  const profile = loadExample();
  const item = readJson(path.join(PROJECT_ROOT, "scripts", "fixtures", "example-posting.json"));
  item.eligibility = assess(item, { profile, now: item.posted });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tailor-selftest-"));
  const dir = path.join(tmp, "output", slugFor(item));
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` → ${detail}`}`);
    if (!ok) failed++;
  };
  const ground = () =>
    spawnSync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "ground-check.mjs"), dir], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, CAREER_AGENT_PROFILE: EXAMPLE_PROFILE },
      encoding: "utf8",
    });

  try {
    writePack(profile, item, dir, { root: tmp });
    const files = fs.readdirSync(dir).sort();
    check("the pack has meta.json, cv.md, gap.md and answers.md", ["answers.md", "cv.md", "gap.md", "meta.json"].every((f) => files.includes(f)), files.join(", "));
    check("the posting is eligible for the example profile", item.eligibility.verdict === "eligible", JSON.stringify(item.eligibility));
    const cv = fs.readFileSync(path.join(dir, "cv.md"), "utf8");
    check("the CV carries the example profile's name, not anyone else's", cv.startsWith(`# ${profile.identity.name}`), cv.slice(0, 40));
    check("the CV leads with what the posting asked for (PostgreSQL is named)", /PostgreSQL/.test(cv), "no PostgreSQL line");
    const gap = fs.readFileSync(path.join(dir, "gap.md"), "utf8");
    check("the gap analysis names the skill the posting wants that the profile lacks (Kubernetes)", /- Kubernetes — not in the profile/.test(gap), gap.slice(0, 200));

    const good = ground();
    check("the tailored pack PASSES npm run ground", good.status === 0, (good.stdout + good.stderr).split("\n").filter((l) => /ungrounded|FAIL|proper-noun|number|year/.test(l)).join(" | "));

    fs.appendFileSync(path.join(dir, "cv.md"), "\n- Led a team of 14 engineers at Initech to migrate 300 services to Kubernetes\n");
    const bad = ground();
    check("the same pack with ONE invented line FAILS npm run ground", bad.status === 1, `exit ${bad.status}`);
    check("...and the failure names the invention", /Initech/.test(bad.stdout) && /"14"|"300"/.test(bad.stdout), bad.stdout.slice(-400));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — a tailored pack is grounded, and one invented line is caught");
  process.exit(failed ? 1 : 0);
}

// Only act when invoked directly; dashboard.mjs and others import from here.
if (process.argv[1] && process.argv[1].endsWith("tailor.mjs")) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
