#!/usr/bin/env node
/**
 * GROUNDING CHECK — the fraud line, enforced.
 *
 * Tailoring is re-presenting true things for a specific audience. Fabrication is fraud. This script
 * is what makes that a rule rather than an intention: it reads a generated document and fails if it
 * contains a hard, checkable claim that does not appear in the master profile.
 *
 * It deliberately checks the CHECKABLE things rather than trying to judge prose:
 *
 *   PROPER NOUNS    every organisation, institution and technology named must be one the profile
 *                   claims, or the company being applied to. Inventing an employer is the worst
 *                   failure mode and the easiest to detect.
 *   NUMBERS         every metric, percentage, duration and quantity must appear in the profile.
 *                   "Improved performance by 40%" is exactly the kind of thing a language model
 *                   invents to sound concrete, and exactly the kind of thing an interviewer probes.
 *   DATES           every year mentioned must be a year the profile covers.
 *
 * What it cannot check is tone, relevance, or whether an achievement is overstated in words rather
 * than numbers. Those still need a human read. This catches the class of error that is objective.
 *
 * Usage:
 *   node scripts/ground-check.mjs output/acme-swe-intern
 *   node scripts/ground-check.mjs --self-test      # proves the check FAILS on invented claims
 *
 * Exit non-zero on any ungrounded claim.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadProfile as loadUserProfile } from "./profile.mjs";

// Words that look like organisations/technologies but are ordinary English, so they must not be
// treated as claims. Kept deliberately short — a false "ungrounded" is annoying, but a missed
// invention is the failure this exists to prevent, so the list errs on the side of checking.
const STOPWORDS = new Set(
  (`A An The And Or But If Then When While As At By For From In Into Of On To With Without I My Me We Our You Your It Its This That These Those There Here What Which Who Whom Whose How Why Dear Sincerely Regards Yours Best Kind Hi Hello Thank Thanks Please Role Team Company Position Application Experience Skills Education Projects Summary Objective Profile Contact Phone Email Address References Available Upon Request January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday ` +
    // Month abbreviations, because dates are now rendered as "Sep 2027 – Jun 2031" rather than
    // "2024-09". A date is not a claim about an employer.
    `Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec ` +
    // Page furniture from the print layout: section rail labels and run-in keys. These are the
    // document's own scaffolding, not things you claim to have worked at.
    `Languages Tools Practice Practices Data Web Cloud Cloud Coursework Leadership Collaboration Stack Focus Right Work Authorisation Ordered Every Nothing Honest Verdict Blockers Standing Gaps Relevant Programming Pipelines Research Training Achievements Classes Advanced Highers Maths Mechanics Computing ` +
    // A non-technical CV uses section headings this list did not carry. Furniture, not claims — the
    // same argument as every other word above.
    `Interests Personal Licence ` +
    // Ordinary English that a FORM uses as a label or an option. "None" is the honest answer to "do
    // you have a valid DBS certificate", and "Answer" is a table header. Neither could be an employer
    // in any document this checks, and the alternative was rewording true answers to get past a
    // spell-check — which is fixing the claim to suit the checker, the exact inversion this file
    // warns about in its own failure message.
    `None Answer Value Field Type Option Question`)
    .split(/\s+/)
    // Lower-cased, and looked up lower-cased. The list already waived "Education" and "Achievements",
    // but a CV that sets its headings in CAPS sends "EDUCATION" and "ACHIEVEMENTS"
    // sailed straight past a Set that only held the title-case spelling and were reported as invented
    // organisations. A stopword that depends on capitalisation is a stopword that works on one CV.
    .filter(Boolean)
    .map((w) => w.toLowerCase()),
);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, "");

/** Your profile (CAREER_AGENT_PROFILE, else profile/master-profile.json), or a clear instruction. */
function loadProfile(dir) {
  return loadUserProfile({ root: dir });
}

/** Every string anywhere in the profile, flattened — the universe of things that may be claimed. */
function profileText(profile) {
  const out = [];
  const walk = (v, key = "") => {
    if (v == null) return;
    if (typeof v === "string") {
      if (!key.startsWith("_")) out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(profile);
  return out;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * THE POSTING'S OWN NAME IS NOT A CLAIM. Every pack quotes the title and company it was written for
 * (the `# Gaps and fit — …` title, the `Ordered for: …` note, "I want to work on …"), and a title such
 * as "2027 Apprentice - Human Insight Social Research - London" made every one of those lines fail
 * with `year "2027"`. So every exact occurrence of the title and of the company is removed before the
 * claims are read, case-insensitively. Only the quoted name goes: the same year anywhere else in the
 * document is still a claim and still checked, and the self-test proves it in both directions.
 *
 * Each occurrence becomes the lower-case word "posting", never nothing. Deleting it outright would
 * make the word after a title at the start of a line read as a line start, and a capitalised word at
 * a line start is excused as ordinary prose — an invented employer right after the title would then
 * pass. Longest name first, so a company named inside the title does not break the title's match.
 */
export function stripTarget(text, names = []) {
  const list = [...new Set(names.map((n) => String(n ?? "").trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  let out = String(text);
  for (const n of list) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escRe(n).replace(/\s+/g, "\\s+")}(?![A-Za-z0-9])`, "gi");
    out = out.replace(re, " posting ");
  }
  return out;
}

export function check(docText, profile, { company = "", strip = [] } = {}) {
  // The posting's own title and company, removed before any claim is read (stripTarget above).
  docText = stripTarget(docText, strip);
  const hay = profileText(profile).join(" \n ");
  const hayNorm = norm(hay);
  const hayWords = new Set(hay.split(/[^A-Za-z0-9+#.]+/).filter(Boolean).map(norm));
  // The target's own name, in every shape the tokeniser can produce from it.
  //
  // Splitting on whitespace alone was not enough: "J.P. Morgan" allowed the token "J.P." while the
  // document tokeniser strips a trailing dot and produced "J.P", so a CV addressed to J.P. Morgan
  // failed its own grounding check for naming the employer it was written for. Splitting on
  // non-alphanumerics as well covers that without widening anything — every fragment added here
  // comes from the company string the allowance already grants in full, and fragments shorter than
  // three characters are never checked in the first place.
  const allowExtra = new Set(
    [company, ...company.split(/\s+/), ...company.split(/[^A-Za-z0-9+#]+/)]
      .filter(Boolean)
      .flatMap((t) => [t, t.replace(/[.'-]+$/, "")])
      .map(norm),
  );
  // A figure inside the target's OWN name is not a metric you are claiming. "Build Challenge 2.0"
  // was failing on "2.0", and "Some Hackathon 2025" would fail the same way.
  // Scoped to the same string the proper-noun allowance already uses, so it cannot let an invented
  // statistic through: the number has to literally appear in the company or role being applied to.
  const allowNumbers = new Set((company.match(/\d[\d.,]*/g) || []).map((n) => n.replace(/[,]/g, "")));

  const findings = [];
  const add = (kind, value, why) => findings.push({ kind, value, why });

  // ---- NUMBERS: metrics, percentages, quantities, durations ----
  // Strip years first; they are checked separately and would otherwise dominate the noise.
  const numbers = [...docText.matchAll(/\b\d[\d,]*(?:\.\d+)?%?\b/g)].map((m) => m[0]);
  for (const n of new Set(numbers)) {
    const bare = n.replace(/[,%]/g, "");
    if (/^(19|20)\d{2}$/.test(bare)) continue; // year — handled below
    if (bare.length <= 1) continue; // single digits are usually prose ("a 2-week sprint" is fine)
    if (allowNumbers.has(bare)) continue; // part of the employer's or event's own name
    if (!hayNorm.includes(norm(n)) && !hayNorm.includes(norm(bare)))
      add("number", n, "no such figure in the profile — a metric that cannot be evidenced");
  }

  // ---- DATES ----
  for (const y of new Set([...docText.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]))) {
    if (!hayNorm.includes(y)) add("year", y, "profile covers no work in this year");
  }

  // ---- PROPER NOUNS: organisations and technologies, checked at TOKEN level ----
  // The first version matched capitalised PHRASES and over-matched across sentence boundaries
  // ("At the University of Exampleton I" was read as one organisation). It also missed Kubernetes,
  // because the technology pattern required a mid-word capital. Both were caught by the self-test,
  // which is the entire argument for having one. Token-level checking fixes both: "Goldman" and
  // "Sachs" are each absent from the profile and each get flagged, while "University" and
  // "Exampleton" are each present and neither does.
  // The bullet characters matter. The list was ASCII-only, so a line beginning "• Organised 3 events"
  // did not count as a line start and "Organised" was reported as an invented organisation. The
  // generated CVs use "-", many hand-made CVs use "•" — a checker that only understands one of them
  // works on the documents this repo writes and fails on the document it attaches.
  // A line start is markers AND whitespace, interleaved, in any order. The previous shape was
  // `\n\s* [markers]* \s*` — one run of markers between two runs of space — which does not match
  // `- **Referees`, because the `**` arrives AFTER the space that follows the bullet. Every
  // `- **Word` line in a generated gap analysis was therefore read as an invented organisation, and
  // it cost three separate rewordings ("Tick", "Personal", "Referees") before the pattern was the
  // obvious suspect. One character class, applied repeatedly, covers `- **x`, `1. **x` and `> **x`.
  const sentenceStart = new Set();
  for (const m of docText.matchAll(/(?:^|[.!?:;]\s+|\n[\s\-*#>•·‣–—\d.)\]]*)([A-Z][A-Za-z0-9+#.'-]*)/g))
    sentenceStart.add(m.index + m[0].length - m[1].length);

  const tokens = [...docText.matchAll(/\b([A-Z][A-Za-z0-9+#.'-]*|[a-z]+(?:\.js|\.ts|\.py)|[A-Za-z]+\+\+|[A-Za-z]+#)\b/g)];
  for (const m of tokens) {
    const tok = m[1].replace(/[.'-]+$/, "");
    if (tok.length < 3 || STOPWORDS.has(tok.toLowerCase())) continue;
    // A capitalised word that merely starts a sentence is ordinary prose, not a claim.
    if (sentenceStart.has(m.index) && !/[A-Z0-9+#.]/.test(tok.slice(1))) continue;
    if (hayWords.has(norm(tok)) || hayNorm.includes(norm(tok)) || allowExtra.has(norm(tok))) continue;
    add("proper-noun", tok, "not an organisation, technology or institution the profile claims");
  }

  return findings;
}

// ------------------------------------------------------------------ self-test
// A check only ever shown passing is not proven to work. This proves it FAILS on invented claims
// and PASSES on grounded ones, using a fixture rather than the real profile.
function selfTest() {
  const fixture = {
    identity: { name: "Test Person" },
    education: [{ institution: "University of Exampleton", start: "2027-09", end: "2031-06" }],
    projects: [
      {
        name: "Pocket Ledger",
        skills: ["Next.js", "TypeScript", "Playwright"],
        achievements: [{ claim: "Cut page weight by 48%", evidence: "repo" }],
      },
    ],
  };
  // A posting whose own title holds a year, laid out the way tailor.mjs quotes it.
  const TITLE = "2029 Apprentice - Human Insight Social Research - London";
  const TITLE_CO = "Example Research Co";
  const TITLE_COMPANY = `${TITLE_CO} ${TITLE} London, GB`; // what main() allows: company, title, location
  const TITLE_STRIP = [TITLE, TITLE_CO];
  const TITLE_DOC = `# Gaps and fit — ${TITLE} at ${TITLE_CO}\n\nStudying at the University of Exampleton.\n\n*Ordered for: ${TITLE} at ${TITLE_CO}.*`;
  const cases = [
    {
      name: "grounded document passes",
      doc: "At the University of Exampleton I built Pocket Ledger with Next.js and TypeScript, cutting page weight by 48%.",
      expect: 0,
    },
    { name: "invented employer is caught", doc: "Software Engineer at Goldman Sachs.", expectKind: "proper-noun" },
    // The pair that keeps the allowance honest. A dotted company name must be allowed in every
    // shape the tokeniser produces — and must NOT drag another employer through with it.
    { name: "a dotted target name is allowed", doc: "Applying to J.P. Morgan.", company: "J.P. Morgan", expect: 0 },
    { name: "a dotted target does not excuse a different employer", doc: "I worked at J.P. Morgan and Goldman Sachs.", company: "J.P. Morgan", expectKind: "proper-noun" },
    { name: "invented metric is caught", doc: "Improved throughput by 73%.", expectKind: "number" },
    { name: "invented year is caught", doc: "Worked there through 2019.", expectKind: "year" },
    { name: "invented technology is caught", doc: "Deployed the service on Kubernetes.", expectKind: "proper-noun" },
    {
      name: "the company being applied to is allowed",
      doc: "I would love to join Stripe.",
      company: "Stripe",
      expect: 0,
    },
    {
      name: "ordinary sentence-initial words are not claims",
      doc: "Building things people use is what I enjoy. Recently I shipped Pocket Ledger.",
      expect: 0,
    },
    // The two widenings made for non-technical CVs, each asserted in BOTH directions.
    // A stopword list and a bullet-character list are the easiest places in this file to quietly
    // stop checking things, so each one gets a case proving an invented employer still gets caught
    // in exactly the position the widening now excuses.
    {
      name: "an ALL-CAPS section heading is furniture, not an invented organisation",
      doc: "EDUCATION\nUniversity of Exampleton\nACHIEVEMENTS\nBuilt Pocket Ledger.",
      expect: 0,
    },
    {
      name: "an ALL-CAPS invented employer is STILL caught",
      doc: "EDUCATION\nUniversity of Exampleton\nEXPERIENCE\nGOLDMAN SACHS — analyst.",
      expectKind: "proper-noun",
    },
    {
      name: "a word after a bullet character is not a claim",
      doc: "Recent work:\n• Organised three sessions at the University of Exampleton",
      expect: 0,
    },
    {
      name: "an invented employer after a bullet character is STILL caught",
      doc: "Recent work:\n• Analyst at Goldman Sachs",
      expectKind: "proper-noun",
    },
    {
      name: "a bolded word opening a bullet is not a claim",
      doc: "Still missing:\n- **Referees** are on file but incomplete\n1. **Availability** confirmed",
      expect: 0,
    },
    {
      name: "an invented employer bolded at the start of a bullet is STILL caught",
      doc: "History:\n- **Goldman Sachs** — analyst",
      expectKind: "proper-noun",
    },
    // The location allowance, both ways. A place the posting names is not a claim; an employer is,
    // and being generous about one must not be generous about the other.
    {
      name: "the event's own location is not an invented organisation",
      doc: "location: Houston, Texas — travel required, no visa needed (UK citizen)",
      company: "Example Hackathon Example Hackathon Houston, Texas",
      expect: 0,
    },
    {
      name: "an invented employer is STILL caught when a location is allowed",
      doc: "location: Houston, Texas. Previously an analyst at Goldman Sachs.",
      company: "Example Hackathon Example Hackathon Houston, Texas",
      expectKind: "proper-noun",
    },
    // The posting's own title, both ways. 2029 is in no string of the fixture profile, so the first
    // row proves the year really is flagged without the title removed — the rows after it are not
    // passing because the year happens to be in the profile.
    {
      name: "a year inside the posting's own title IS flagged when the title is not removed",
      doc: TITLE_DOC,
      company: TITLE_COMPANY,
      expectKind: "year",
    },
    {
      name: "a year that appears only inside the posting's own title is not a claim",
      doc: TITLE_DOC,
      company: TITLE_COMPANY,
      strip: TITLE_STRIP,
      expect: 0,
    },
    {
      name: "...matched case-insensitively",
      doc: TITLE_DOC.replaceAll(TITLE, TITLE.toUpperCase()),
      company: TITLE_COMPANY,
      strip: TITLE_STRIP,
      expect: 0,
    },
    {
      name: "the same year as a claim in a CV line is STILL caught",
      doc: `${TITLE_DOC}\n- Ran a 2029 campaign for a local café.`,
      company: TITLE_COMPANY,
      strip: TITLE_STRIP,
      expectKind: "year",
    },
    {
      name: "an invented employer next to the posting's title is STILL caught",
      doc: `*Ordered for: ${TITLE} at ${TITLE_CO}.* Previously an analyst at Goldman Sachs.`,
      company: TITLE_COMPANY,
      strip: TITLE_STRIP,
      expectKind: "proper-noun",
    },
    {
      name: "an invented single-word employer after a title at a line start is STILL caught",
      doc: `Applied:\n${TITLE} Deloitte`,
      company: TITLE_COMPANY,
      strip: TITLE_STRIP,
      expectKind: "proper-noun",
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const f = check(c.doc, fixture, { company: c.company || "", strip: c.strip || [] });
    if (c.expect === 0) {
      const ok = f.length === 0;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : " → " + JSON.stringify(f)}`);
      if (!ok) failed++;
    } else {
      const ok = f.some((x) => x.kind === c.expectKind);
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name} (expected a ${c.expectKind} finding, got ${f.length})`);
      if (!ok) failed++;
    }
  }

  // The same rule through the real command, on a pack folder: the title must be read from meta.json.
  // A check() that can strip the title, but a main() that never passes it, fails here.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ground-selftest-"));
  try {
    const profileFile = path.join(tmp, "profile.json");
    fs.writeFileSync(profileFile, JSON.stringify(fixture));
    const pack = path.join(tmp, "pack");
    fs.mkdirSync(pack);
    fs.writeFileSync(path.join(pack, "meta.json"), JSON.stringify({ company: TITLE_CO, title: TITLE, location: "London, GB", posting_terms: [] }));
    fs.writeFileSync(path.join(pack, "gap.md"), `# Gaps and fit — ${TITLE} at ${TITLE_CO}\n\nStudying at the University of Exampleton.\n`);
    const cv = `# Test Person\n\n## Education\n\n**University of Exampleton** · Sep 2027 – Jun 2031\n\n---\n\n*Ordered for: ${TITLE} at ${TITLE_CO}. Every line above appears in the master profile.*\n`;
    fs.writeFileSync(path.join(pack, "cv.md"), cv);
    const ground = () =>
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), pack], { cwd: tmp, env: { ...process.env, CAREER_AGENT_PROFILE: profileFile }, encoding: "utf8" });
    const row = (name, ok, detail) => {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " → " + detail}`);
      if (!ok) failed++;
    };
    const a = ground();
    row("CLI: a pack whose posting title holds a year passes (title read from meta.json)", a.status === 0 && /RESULT: pass/.test(a.stdout), `exit ${a.status}\n${a.stdout}`);
    fs.writeFileSync(path.join(pack, "cv.md"), cv.replace("## Education", "## Experience\n\n- Ran a 2029 campaign for a local café.\n\n## Education"));
    const b = ground();
    row("CLI: ...and the same year as a CV claim fails it", b.status === 1 && /cv\.md: 1 ungrounded claim/.test(b.stdout) && /year\s+"2029"/.test(b.stdout), `exit ${b.status}\n${b.stdout}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — the check fails on invented claims and passes on grounded ones");
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------ main
// Guarded so this file can be IMPORTED as well as run. Without it, `import { check }` executed the
// CLI, printed a usage line and exited 2 — an exported function that could not be called. Third time
// this project has hit "library and command in one file"; the rule now is that the command half lives
// inside main() and only runs when process.argv[1] is this file.
function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();

  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("usage: npm run ground -- output/<company>-<role>   |   npm test");
    process.exit(2);
  }
  const root = process.cwd();
  const profile = loadProfile(root);
  const dir = path.resolve(root, target);
  if (!fs.existsSync(dir)) {
    console.error(`ground: ${target} does not exist`);
    process.exit(2);
  }
  // The target of the application is not a fabrication, so its name must be allowed. Two earlier
  // versions of this got it wrong: `slug.split("-")[0]` flagged the second word of a two-word
  // organiser as an invented organisation, and the whole folder name still missed anything past the
  // slug's 60-character truncation ("...internship-comme" does not contain "Commercial"). tailor.mjs
  // writes meta.json with the untruncated company and title, so the checker reads the real target
  // instead of reconstructing it from a filename.
  const metaFile = path.join(dir, "meta.json");
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : null;
  // The target's own name AND its own location. An event's location is printed back by the gap
  // analysis ("location: Houston, Texas — travel required, no visa needed"), and a place the posting
  // itself names is not an organisation you claim to have worked at. Scoped to the exact
  // location string from the source, the same way the company allowance is scoped to the company —
  // it cannot let an invented employer through, because the token has to literally appear in the
  // location of the thing being applied to. The self-test asserts that in both directions.
  const company = meta
    ? `${meta.company} ${meta.title} ${meta.location || ""}`
    : path.basename(dir).replace(/-/g, " ");
  // A supplementary-answer sheet has to be able to name the employer's own products, taken from their
  // own posting — that is not invented history. The allowance is deliberately scoped to answers.md:
  // the CV stays strict, because a proper noun there IS a claim about where you have worked.
  const postingTerms = (meta?.posting_terms || []).join(" ");
  // cv.html is the source the PDF is printed from, so it is the document a recruiter actually reads.
  // Checking only the .md would have left the shipped artifact unchecked — exactly the gap the
  // PROVE-IT rule exists to close.
  const files = fs.readdirSync(dir).filter((f) => /\.(md|txt|html)$/.test(f));
  if (!files.length) {
    console.error(`ground: no .md/.txt/.html documents in ${target} — nothing to check (reported as NOT-CHECKED, not as a pass)`);
    process.exit(2);
  }

  /** The fenced ```paste blocks — the only part of an answer sheet that is actually submitted. */
  /**
   * Employer vocabulary the sheet declares up front, as `<!-- allow: ProductName, TeamName -->`.
   *
   * The posting supplies most of it automatically (meta.json posting_terms), but an answer legitimately
   * quotes things the posting itself does not contain — an employer's own blog post, say.
   * Making the author declare those in one visible line keeps the allowance auditable: you can see
   * exactly which words were waved through and go and check them. A silent widening of the check would
   * be indistinguishable from the check not working.
   */
  const declaredAllow = (mdText) => {
    const m = /<!--\s*allow:([^>]*?)-->/i.exec(mdText);
    return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  };

  const pasteBlocks = (mdText) =>
    [...mdText.matchAll(/^```paste[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]).join("\n\n");

  /** HTML reduced to what a reader sees. Styles and scripts are machinery, not claims. */
  const visibleText = (html) =>
    html
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

  let total = 0;
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    // An answer sheet is a WORKSHEET, not a document that gets sent. Its notes, word counts and
    // source URLs are commentary; only the ```paste blocks reach an employer, so only those are
    // checked — and they may name the employer's own products, because reading the job description is
    // not fabrication. Everything outside a paste block is reported as NOT-CHECKED, never as a pass.
    // form-questions.md is the EMPLOYER's form, transcribed off their page by apply.mjs's recon —
    // their question wording, their dropdown options, their field IDs. Running the claim check over
    // it asks "did you invent Spanish, French and question 7016", which is a category error:
    // nothing in that file is a claim by you, and none of it is submitted. It was producing dozens of
    // findings on a single pack and drowning the real ones. Skipped BY NAME and announced,
    // because a check that quietly stops running is the failure mode this repo keeps writing down.
    if (f === "form-questions.md") {
      console.log(`\n${f}: NOT-CHECKED — this is the employer's own form, harvested by recon, not a document you send.`);
      continue;
    }
    // COWORK.md is a WORKSHEET for an agent, exactly like answers.md is a worksheet for a person: it
    // carries the target URL, its requisition id, the deadline and a page of instructions, none of
    // which is a claim about you. What IS a claim is every value it tells the agent to type, and
    // those live in ```paste blocks for precisely this reason — so the things that reach an employer
    // are checked and the scaffolding around them is reported as NOT-CHECKED rather than waved
    // through as verified.
    const isAnswers = f === "answers.md" || f === "COWORK.md";
    let body = isAnswers ? pasteBlocks(raw) : f.endsWith(".html") ? visibleText(raw) : raw;
    if (isAnswers && !body.trim()) {
      // Loud, not quiet. An answer sheet with no paste blocks is a malformed sheet, and letting the
      // run pass would report an unverified document as a verified one.
      console.error(`\n${f}: NOT-CHECKED — no \`\`\`paste blocks found. Nothing in it is verified.`);
      total += 1;
      continue;
    }
    // A [BRACKETED SLOT] is a hole you have to fill, not a claim. It is stripped before checking
    // and counted out loud, because pasting an answer with the placeholder still in it is the single
    // most embarrassing way this file could fail.
    let unfilled = 0;
    if (isAnswers) {
      unfilled = (body.match(/\[[A-Z][A-Z \-]{4,}\]/g) || []).length;
      body = body.replace(/\[[A-Z][A-Z \-]{4,}\]/g, " ");
      if (unfilled) console.log(`\n${f}: ${unfilled} slot(s) still need your words before you paste`);
    }
    const declared = isAnswers ? declaredAllow(raw) : [];
    if (declared.length) console.log(`\n${f}: allowing ${declared.length} employer term(s) declared in the sheet — ${declared.join(", ")}`);
    const findings = check(body, profile, {
      company: isAnswers ? `${company} ${postingTerms} ${declared.join(" ")}` : company,
      // The posting's own title and company, from the same meta.json as the allowance above. A
      // folder with no meta.json strips nothing: its name is a slug, not the posting's exact title.
      strip: meta ? [meta.title, meta.company] : [],
    });
    console.log(`\n${f}: ${findings.length ? findings.length + " ungrounded claim(s)" : "grounded"}`);
    for (const x of findings) console.log(`  ${x.kind.padEnd(13)} ${JSON.stringify(x.value)} — ${x.why}`);
    total += findings.length;
  }
  console.log(
    total
      ? `\nRESULT: FAIL — ${total} claim(s) not traceable to the profile.\n        Fix the CLAIM, never the check. If it is true, add it to the profile with evidence.`
      : `\nRESULT: pass — every checkable claim traces to the profile. (Tone, relevance and overstatement still need your eyes.)`,
  );
  process.exit(total ? 1 : 0);

}

if (process.argv[1] && process.argv[1].endsWith("ground-check.mjs")) main();
