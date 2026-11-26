#!/usr/bin/env node
/**
 * PROFILE-CHECK — is your profile complete enough for the scripts to do their job?
 *
 * Every field below is one a script actually reads. For each missing or weak one it prints WHY the
 * agent needs it, so "fill in your profile" becomes a specific list. Exit 1 if any REQUIRED field is
 * missing; RECOMMENDED fields are reported but do not fail.
 *
 *   npm run profile:check                 check profile/master-profile.json (or CAREER_AGENT_PROFILE)
 *   node scripts/profile-check.mjs --example   check the shipped fictional example
 *   node scripts/profile-check.mjs --self-test prove it fails on incomplete profiles
 *
 * `npm run setup` asks exactly these questions, one at a time, in this order. `/career-onboard` in
 * Claude Code fills what your CV states and asks you for the rest until this passes.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXAMPLE_PROFILE, isTechSector, loadExample, profilePath, readJson } from "./profile.mjs";

/** Read a dotted path with [n] indexes: get(p, "education[0].end"). */
export function get(obj, p) {
  return p.split(".").reduce((o, k) => {
    if (o == null) return undefined;
    const m = /^(.+?)\[(\d+)\]$/.exec(k);
    return m ? o[m[1]]?.[Number(m[2])] : o[k];
  }, obj);
}

/** Write a dotted path, creating objects/arrays on the way. */
export function set(obj, p, value) {
  const keys = p.split(".");
  let o = obj;
  keys.forEach((k, i) => {
    const m = /^(.+?)\[(\d+)\]$/.exec(k);
    const last = i === keys.length - 1;
    if (m) {
      o[m[1]] = Array.isArray(o[m[1]]) ? o[m[1]] : [];
      const arr = o[m[1]];
      const idx = Number(m[2]);
      if (last) arr[idx] = value;
      else o = arr[idx] = arr[idx] && typeof arr[idx] === "object" ? arr[idx] : {};
    } else if (last) o[k] = value;
    else o = o[k] = o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? o[k] : {};
  });
  return obj;
}

const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const listOk = (v) => Array.isArray(v) && v.some((x) => nonEmpty(String(x ?? "")));
const DATE_RE = /^(\d{4}-(0[1-9]|1[0-2])|present)$/;

/** A `YYYY-MM` date; with allowPresent, the word "present" too. The same rule setup.mjs asks with. */
export function isDate(v, allowPresent = false) {
  const s = typeof v === "string" ? v.trim() : "";
  return DATE_RE.test(s) && (allowPresent || s !== "present");
}

/**
 * THE SCHEMA — every field the scripts read, in the order `npm run setup` asks for them.
 *
 *   level   required: a script breaks or writes something wrong without it → exit 1
 *           recommended: works without, but a form box or a ranking signal is lost
 *   kind    text | number | date (YYYY-MM; `allowPresent` also accepts "present") | list
 *           (comma-separated) | lines (one item per answer) | pair (answer + detail) | experience |
 *           projects | leadership | skills | offer | referees
 *   when    optional: the field applies only to a profile this returns true for. Elsewhere it is
 *           neither reported nor asked (a GitHub link is asked of a tech profile only — isTechSector)
 */
export const FIELDS = [
  // ---- identity
  { path: "identity.name", level: "required", kind: "text", ask: "Your full name, as it should appear on your CV", why: "Printed at the top of every CV (cv-html.mjs), used in the PDF filename (tailor.mjs), typed into every form (apply.mjs), and checked to survive PDF text extraction (render-pdf.mjs)." },
  { path: "identity.email", level: "required", kind: "text", ask: "The email address employers should use", why: "CV contact line, every application form, and the PDF readability check (render-pdf.mjs)." },
  { path: "identity.phone", level: "required", kind: "text", ask: "Your phone number, as you would write it on a CV", why: "CV contact line and the phone box on application forms (apply.mjs)." },
  { path: "identity.location", level: "required", kind: "text", ask: "Where you are based (city, country)", why: "Fills 'current location' on forms when no address is given (apply.mjs) and the field table (answers.mjs)." },
  { path: "identity.headline", level: "required", kind: "text", ask: "A one-sentence summary of you, in your own words (no claims you cannot back up)", why: "The summary line under your name on every CV (cv-html.mjs)." },
  { path: "identity.work_authorisation", level: "required", kind: "text", ask: "Your right to work, in one sentence (e.g. citizen of X, no sponsorship needed)", why: "Printed on the CV and in 'why you' answers, and shown next to the sponsorship screener (answers.mjs)." },
  // ---- target
  { path: "target.countries", level: "required", kind: "list", ask: "Countries you have the right to work in (comma-separated; include short forms, e.g. United Kingdom, UK, England)", why: "eligibility.mjs passes postings in these countries and cuts ones needing authorisation you lack; apply.mjs answers the sponsorship and right-to-work screeners only for these." },
  { path: "target.roles", level: "required", kind: "list", ask: "The roles you are looking for (comma-separated)", why: "What /career-onboard and you use to choose sources and keywords; shown in the profile summary." },
  { path: "target.locations", level: "required", kind: "list", ask: "Cities you would work in (comma-separated)", why: "discover.mjs keeps postings in these places and eligibility.mjs rules out postings elsewhere." },
  { path: "target.timing.intake_season", level: "required", kind: "text", ask: "Which intake you are applying for: summer, spring, autumn, year-long placement…", why: "Scores postings that name it (discover.mjs) and fills 'earliest start' (answers.mjs)." },
  { path: "target.timing.intake_year", level: "required", kind: "number", ask: "The year of that intake (e.g. 2030)", why: "eligibility.mjs rules out postings that only mention an earlier year, and discover.mjs picks the right internship list for this year." },
  // ---- education
  { path: "education[0].institution", level: "required", kind: "text", ask: "Your university (or current institution)", why: "CV education line, every form's university box, and the PDF readability check." },
  { path: "education[0].qualification", level: "required", kind: "text", ask: "Your degree as written on a CV (e.g. BSc (Hons) Computer Science)", why: "CV education line and the 'degree' box on forms." },
  { path: "education[0].subject", level: "required", kind: "text", ask: "Your subject on its own (e.g. Computer Science)", why: "The 'discipline / major / field of study' box on forms (apply.mjs)." },
  { path: "education[0].start", level: "required", kind: "date", ask: "When the degree started (YYYY-MM, e.g. 2027-09)", why: "CV dates and 'course dates' on forms." },
  { path: "education[0].end", level: "required", kind: "date", allowPresent: true, ask: "When it ends or ended (YYYY-MM, e.g. 2031-06)", why: "CV dates and 'expected graduation' on forms; its year is what the grounding check allows you to mention." },
  { path: "education[0].graduation_year", level: "required", kind: "number", ask: "Your graduation year (e.g. 2031)", why: "eligibility.mjs compares it with your intake year to decide final-year-only and penultimate-year schemes; apply.mjs fills it into graduation-year boxes." },
  { path: "education[0].year_of_study", level: "required", kind: "text", ask: "Your year of study at the time you apply (e.g. Third year of four)", why: "The 'year of study' box on forms (answers.mjs, cowork-brief.mjs)." },
  { path: "education[0].grade", level: "required", kind: "text", ask: "Your current or predicted grade, as you can evidence it (e.g. On track for a First, 72% average)", why: "CV education line, the grade box on forms, and 'why you' answers. Only numbers written here may appear in generated text." },
  // ---- experience / projects / skills / gaps
  { path: "experience", level: "required", kind: "experience", ask: "Work, research or volunteering experience", why: "The body of every CV. Each achievement needs dates and a concrete, measurable claim — the grounding check only lets a CV say what is written here." },
  { path: "projects", level: "required", kind: "projects", ask: "Projects you built", why: "CV projects section and the 'fit' paragraphs in answers. Same rule: dates and concrete claims with numbers." },
  { path: "skills", level: "required", kind: "skills", ask: "Your skills, in groups", why: "select.mjs matches postings against these names and cv-html.mjs prints them; a skill that is not here can never appear on a generated CV." },
  { path: "gaps_known.items", level: "required", kind: "lines", ask: "Things postings often ask for that you genuinely do NOT have yet", why: "Every gap analysis lists them (tailor.mjs) and answers.mjs offers them for the 'weakness' question. Honest gaps make the rest believable." },
  // ---- recommended
  { path: "identity.links.linkedin", level: "recommended", kind: "text", ask: "Your LinkedIn URL", why: "The LinkedIn box on forms (apply.mjs)." },
  { path: "identity.links.github", level: "recommended", kind: "text", when: isTechSector, ask: "Your GitHub URL", why: "CV contact line and the GitHub box on forms." },
  { path: "identity.links.portfolio", level: "recommended", kind: "text", ask: "Your portfolio or personal site URL", why: "CV contact line and the website box on forms." },
  { path: "identity.address.line1", level: "recommended", kind: "text", ask: "Address line 1 (only for filling forms; skip if you would rather type it yourself)", why: "Address boxes on forms (apply.mjs). Never printed on the CV." },
  { path: "identity.address.city", level: "recommended", kind: "text", ask: "Address: town or city", why: "The town/city box on application forms (apply.mjs, answers.mjs)." },
  { path: "identity.address.postcode", level: "recommended", kind: "text", ask: "Address: postcode", why: "The postcode box on application forms (apply.mjs, answers.mjs)." },
  { path: "identity.address.country", level: "recommended", kind: "text", ask: "Address: country", why: "The country box on application forms (apply.mjs, answers.mjs)." },
  { path: "target.sector", level: "recommended", kind: "text", ask: "The sector you are aiming at (e.g. Technology)", why: "Context for /career-onboard and for choosing sources." },
  { path: "target.bar.home_cities", level: "recommended", kind: "list", ask: "Your home city or cities — where a role counts as an upgrade on location alone (comma-separated)", why: "bar.mjs ranks home-city roles as upgrades; discover.mjs and the dashboard score them higher." },
  { path: "target.boost_keywords", level: "recommended", kind: "list", ask: "Keywords that should push a posting up your list (comma-separated, e.g. data, backend, python)", why: "discover.mjs scores postings that name them; select.mjs uses them for thin postings." },
  { path: "target.bar_to_beat", level: "recommended", kind: "offer", ask: "Do you already hold an offer? Type the employer's name, or 'none'", why: "bar.mjs ranks every posting against it: the same kind of employer is a sideways move, a stronger one, your home city or more pay is an upgrade." },
  { path: "education[0].relevant_modules", level: "recommended", kind: "list", ask: "Relevant modules or classes (comma-separated)", why: "The 'Relevant classes' line on the CV." },
  { path: "leadership", level: "recommended", kind: "leadership", ask: "Leading, teaching or organising something", why: "The teamwork answer (answers.mjs) and the Leadership section of the CV." },
  { path: "stories.hardest_challenge", level: "recommended", kind: "text", ask: "The hardest challenge you solved (technical or not), in your own words, on one line: what went wrong, how you found out, what fixed it", why: "Used verbatim when a form asks for your hardest challenge (many call it the 'hardest technical challenge' question; answers.mjs, apply.mjs). Without it, that answer is left for you." },
  { path: "voice.samples", level: "recommended", kind: "lines", ask: "Paste a paragraph you wrote yourself (one line), so drafts can sound like you", why: "/career-onboard and any drafting you ask Claude for use it to write in your voice." },
  { path: "referees.items", level: "recommended", kind: "referees", ask: "People who have agreed to give you a reference", why: "Referee tables on every answer sheet (answers.mjs). Consent must start with 'given' or the tool says not to list them." },
  { path: "logistics.availability", level: "recommended", kind: "text", ask: "Your availability (e.g. evenings, weekends and university holidays)", why: "Availability questions on shift and agency forms (answers.mjs)." },
  { path: "logistics.notice_period", level: "recommended", kind: "text", ask: "Your notice period (e.g. None, I am a student)", why: "Notice-period boxes on forms (apply.mjs, answers.mjs)." },
  { path: "logistics.right_to_work_document", level: "recommended", kind: "text", ask: "The document that proves your right to work (e.g. passport) — the TYPE only, never its number", why: "Right-to-work questions on agency forms (answers.mjs)." },
  { path: "logistics.own_transport", level: "recommended", kind: "pair", ask: "Do you have your own transport? (yes/no)", why: "A common agency screener (answers.mjs, cowork-brief.mjs)." },
  { path: "logistics.over_18", level: "recommended", kind: "pair", ask: "Are you over 18? (yes/no)", why: "A common screener. Your date of birth is never stored." },
];

/** Is this field answered in the profile? */
export function answered(profile, f) {
  // A field that does not apply to this profile has nothing to answer, so it is neither reported
  // here nor asked by setup.mjs (which asks exactly the fields this calls unanswered).
  if (f.when && !f.when(profile)) return true;
  const v = get(profile, f.path);
  switch (f.kind) {
    case "text": return nonEmpty(v);
    case "date": return isDate(v, f.allowPresent);
    case "number": return Number.isFinite(Number(v)) && v !== null && v !== "" && Number(v) > 0;
    case "list": case "lines": return listOk(v);
    case "pair": return Boolean(v && nonEmpty(v.answer));
    case "offer": return v === null || (v && nonEmpty(v.employer));
    case "skills": return Object.entries(v || {}).some(([k, list]) => !k.startsWith("_") && Array.isArray(list) && list.some((s) => nonEmpty(s?.name)));
    case "experience": case "projects": case "leadership": return Array.isArray(v) && v.length > 0;
    case "referees": return Array.isArray(v) && v.some((r) => nonEmpty(r?.name));
    default: return v != null;
  }
}

/** Per-entry checks for experience / projects / leadership: dates, a title, and real achievements. */
function entryIssues(profile, key) {
  const missing = [];
  const weak = [];
  (profile[key] || []).forEach((e, i) => {
    const at = `${key}[${i}]`;
    const nameKeys = key === "projects" ? ["name"] : ["organisation", "title"];
    for (const k of [...nameKeys, "start", "end"]) if (!nonEmpty(e?.[k])) missing.push({ path: `${at}.${k}`, why: k === "start" || k === "end" ? "Every entry needs dates (YYYY-MM, or 'present' for end) — the CV prints them and the grounding check only allows years written in the profile." : "The CV heading for this entry." });
    for (const k of ["start", "end"]) if (nonEmpty(e?.[k]) && !DATE_RE.test(e[k].trim())) weak.push({ path: `${at}.${k}`, why: `"${e[k]}" is not YYYY-MM (or "present"), so the CV cannot format it.` });
    const ach = (e?.achievements || []).filter((a) => nonEmpty(a?.claim));
    if (!ach.length) missing.push({ path: `${at}.achievements`, why: "At least one concrete achievement — what you did and what changed because of it. Without one, this entry contributes nothing the CV can print." });
    (e?.achievements || []).forEach((a, j) => {
      if (!nonEmpty(a?.claim)) return;
      if (!/\d/.test(a.claim)) weak.push({ path: `${at}.achievements[${j}].claim`, why: "No number or measurable outcome. The grounding check only lets a CV state numbers that are in your profile, so a claim without one can never be made concrete." });
      if (!nonEmpty(a?.evidence)) weak.push({ path: `${at}.achievements[${j}].evidence`, why: "Where can this be checked (a link, a manager, a certificate)? An interviewer may ask." });
    });
  });
  return { missing, weak };
}

/**
 * Check a profile. Returns { missing, weak }, each a list of { path, why }. `missing` holds the
 * REQUIRED problems (exit 1); `weak` holds recommended fields and quality issues.
 */
export function checkProfile(profile) {
  const p = profile || {};
  const missing = [];
  const weak = [];
  for (const f of FIELDS) {
    if (f.kind === "experience" || f.kind === "projects") continue; // checked together below
    if (answered(p, f)) continue;
    // A date that is filled in but not YYYY-MM fails like a missing one, and says what it holds:
    // the CV would print the free text as written ("sometime in autumn – Jun 2031").
    const v = get(p, f.path);
    const why = f.kind === "date" && nonEmpty(v)
      ? `"${v}" is not YYYY-MM${f.allowPresent ? ' (or "present")' : ""}, so the CV would print it as written and forms cannot read it. ${f.why}`
      : f.why;
    (f.level === "required" ? missing : weak).push({ path: f.path, why });
  }
  // Experience OR projects: at least one entry between them, and every entry complete.
  const hasEntries = (p.experience || []).length + (p.projects || []).length > 0;
  if (!hasEntries) missing.push({ path: "experience / projects", why: FIELDS.find((f) => f.path === "experience").why });
  for (const key of ["experience", "projects", "leadership"]) {
    const r = entryIssues(p, key);
    (key === "leadership" ? weak : missing).push(...r.missing);
    weak.push(...r.weak);
  }
  // Consistency checks that would make a script say something wrong.
  const uni = p.education?.[0] || {};
  if (nonEmpty(uni.end) && Number(uni.graduation_year) && !String(uni.end).startsWith(String(uni.graduation_year)))
    weak.push({ path: "education[0].graduation_year", why: `It says ${uni.graduation_year} but education[0].end says ${uni.end}. Forms and the eligibility gate would disagree.` });
  if (nonEmpty(p.identity?.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.identity.email))
    weak.push({ path: "identity.email", why: `"${p.identity.email}" does not look like an email address.` });
  return { missing, weak };
}

export function report(result, { label = "profile" } = {}) {
  const lines = [`profile:check — ${label}`, ""];
  if (result.missing.length) {
    lines.push(`MISSING (required) — the scripts cannot do their job without these:`);
    for (const m of result.missing) lines.push(`  ✗ ${m.path}`, `      why: ${m.why}`);
    lines.push("");
  }
  if (result.weak.length) {
    lines.push(`WEAK (recommended) — works without, but worse:`);
    for (const w of result.weak) lines.push(`  ! ${w.path}`, `      why: ${w.why}`);
    lines.push("");
  }
  lines.push(
    result.missing.length
      ? `RESULT: FAIL — ${result.missing.length} required field(s) missing. Fix with: npm run setup  (or /career-onboard in Claude Code)`
      : `RESULT: pass — every required field is present${result.weak.length ? ` (${result.weak.length} recommendation(s) above)` : ""}.`,
  );
  return lines.join("\n");
}

// ------------------------------------------------------------------ self-test
function selfTest() {
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` → ${detail}`}`);
    if (!ok) failed++;
  };
  const example = loadExample();
  const clone = () => JSON.parse(JSON.stringify(example));

  const ex = checkProfile(example);
  check("the fictional example profile passes with nothing missing", ex.missing.length === 0, JSON.stringify(ex.missing.map((m) => m.path)));
  check("...and nothing weak — it is a complete example", ex.weak.length === 0, JSON.stringify(ex.weak.map((m) => m.path)));

  const empty = checkProfile({});
  const required = FIELDS.filter((f) => f.level === "required" && !["experience", "projects"].includes(f.kind)).map((f) => f.path);
  check("an empty profile reports every required field", required.every((r) => empty.missing.some((m) => m.path === r)) && empty.missing.some((m) => m.path === "experience / projects"), JSON.stringify(empty.missing.map((m) => m.path)));
  check("every reported field says WHY it is needed", [...empty.missing, ...empty.weak].every((m) => m.why && m.why.length > 20));

  const noGrad = clone();
  delete noGrad.education[0].graduation_year;
  const g = checkProfile(noGrad);
  check("one removed required field is reported, and only that one", g.missing.length === 1 && g.missing[0].path === "education[0].graduation_year", JSON.stringify(g.missing.map((m) => m.path)));

  const vague = clone();
  vague.experience[0].achievements[0].claim = "Helped with the data pipeline";
  const v = checkProfile(vague);
  check("a claim with no number is WEAK, not silently accepted", v.weak.some((w) => w.path === "experience[0].achievements[0].claim"), JSON.stringify(v.weak.map((w) => w.path)));
  check("...but it does not fail the check on its own", v.missing.length === 0, JSON.stringify(v.missing));

  const undated = clone();
  delete undated.projects[1].start;
  const u = checkProfile(undated);
  check("an entry without dates is a REQUIRED gap", u.missing.some((m) => m.path === "projects[1].start"), JSON.stringify(u.missing.map((m) => m.path)));

  const noAch = clone();
  noAch.experience[1].achievements = [];
  check("an entry with no achievement is a REQUIRED gap", checkProfile(noAch).missing.some((m) => m.path === "experience[1].achievements"));

  const noOffer = clone();
  noOffer.target.bar_to_beat = null;
  check("an explicit 'no offer' (null) is an answer, not a gap", !checkProfile(noOffer).weak.some((w) => w.path === "target.bar_to_beat"));

  const mismatch = clone();
  mismatch.education[0].graduation_year = 2099;
  check("a graduation year that disagrees with the end date is flagged", checkProfile(mismatch).weak.some((w) => w.path === "education[0].graduation_year"));

  // Education dates: free text FAILS the check (it would print on the CV as written), naming the
  // field and the value. "present" is an end word only; month 13 is not a month.
  for (const [k, bad] of [["start", "sometime in autumn"], ["end", "summer-ish"], ["start", "present"], ["end", "2031-13"]]) {
    const p = clone();
    p.education[0][k] = bad;
    const r = checkProfile(p);
    check(`education[0].${k} = "${bad}" is a REQUIRED gap that names the field and the value`, r.missing.length === 1 && r.missing[0].path === `education[0].${k}` && r.missing[0].why.includes(`"${bad}"`), JSON.stringify(r.missing));
  }
  const goodDates = clone();
  goodDates.education[0].start = "2026-09";
  goodDates.education[0].end = "present";
  check("a YYYY-MM education start and an end of 'present' are accepted", checkProfile(goodDates).missing.length === 0, JSON.stringify(checkProfile(goodDates).missing));

  // GitHub is recommended to a tech profile only (isTechSector). A marketing student was told to add
  // one. Both ways, on the same example with the GitHub link removed.
  const noGithub = (target) => {
    const p = clone();
    delete p.identity.links.github;
    Object.assign(p.target, target);
    return p;
  };
  const marketingNoGh = noGithub({ sector: "Marketing", roles: ["Marketing intern", "Brand placement"] });
  const listsGithub = (p) => checkProfile(p).weak.some((w) => w.path === "identity.links.github");
  check("a marketing profile with no GitHub link is not told to add one", !listsGithub(marketingNoGh) && !/github/i.test(report(checkProfile(marketingNoGh))), report(checkProfile(marketingNoGh)));
  check("...nor is one with an empty sector and only non-tech roles", !listsGithub(noGithub({ sector: "", roles: ["Marketing intern"] })), "listed");
  check("the tech example with no GitHub link is still told to add one", listsGithub(noGithub({})), JSON.stringify(checkProfile(noGithub({})).weak.map((w) => w.path)));
  check("...and so is a profile whose field is not known yet (no sector, no roles)", listsGithub(noGithub({ sector: "", roles: [] })), "not listed");
  check("the hardest-challenge question asks for one 'technical or not'", /hardest challenge you solved \(technical or not\)/.test(FIELDS.find((f) => f.path === "stories.hardest_challenge").ask), FIELDS.find((f) => f.path === "stories.hardest_challenge").ask);

  // The CLI, both ways: no profile file at all → exit 1 naming fields; the example → exit 0.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "profilecheck-"));
  const cli = (env) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, ...env }, encoding: "utf8" });
  const none = cli({ CAREER_AGENT_PROFILE: path.join(tmp, "nope.json") });
  check("CLI: no profile file → exit 1", none.status === 1, `exit ${none.status}`);
  check("CLI: ...and it names the missing fields", /identity\.name/.test(none.stdout) && /education\[0\]\.graduation_year/.test(none.stdout), none.stdout.slice(0, 300));
  const ok = cli({ CAREER_AGENT_PROFILE: EXAMPLE_PROFILE });
  check("CLI: the example profile → exit 0", ok.status === 0, `exit ${ok.status}\n${ok.stdout}`);
  // The CLI on one profile, differing only in education[0].start: free text → exit 1, YYYY-MM → exit 0.
  const withStart = (start) => {
    const p = clone();
    p.education[0].start = start;
    const f = path.join(tmp, `start-${start.replace(/\W+/g, "-")}.json`);
    fs.writeFileSync(f, JSON.stringify(p, null, 2));
    return cli({ CAREER_AGENT_PROFILE: f });
  };
  const freeText = withStart("sometime in autumn");
  check("CLI: education[0].start = \"sometime in autumn\" → exit 1", freeText.status === 1, `exit ${freeText.status}\n${freeText.stdout}`);
  check("CLI: ...naming education[0].start and saying it is not YYYY-MM", /✗ education\[0\]\.start\n\s+why: "sometime in autumn" is not YYYY-MM/.test(freeText.stdout), freeText.stdout.slice(0, 600));
  const validStart = withStart("2026-09");
  check("CLI: the same profile with education[0].start = \"2026-09\" → exit 0", validStart.status === 0, `exit ${validStart.status}\n${validStart.stdout}`);
  // The CLI prints the GitHub line for the tech example without a link, and not for marketing.
  const cliFor = (p, name) => {
    const f = path.join(tmp, `${name}.json`);
    fs.writeFileSync(f, JSON.stringify(p, null, 2));
    return cli({ CAREER_AGENT_PROFILE: f });
  };
  const ghTech = cliFor(noGithub({}), "tech-no-gh");
  const ghMkt = cliFor(marketingNoGh, "marketing-no-gh");
  check("CLI: the tech example without GitHub → a \"! identity.links.github\" line", ghTech.status === 0 && /! identity\.links\.github/.test(ghTech.stdout), ghTech.stdout);
  check("CLI: a marketing profile without GitHub → no GitHub line", ghMkt.status === 0 && !/github/i.test(ghMkt.stdout), ghMkt.stdout);
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — the check fails on every kind of incomplete profile and passes on a complete one");
  process.exit(failed ? 1 : 0);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const file = process.argv.includes("--example") ? EXAMPLE_PROFILE : profilePath();
  const label = path.relative(process.cwd(), file) || file;
  if (!fs.existsSync(file)) {
    console.log(`profile:check — no profile at ${label}\n`);
    console.log(`Create it with:  npm run setup        (terminal quiz, no AI)`);
    console.log(`           or:   /career-onboard      (in Claude Code; put your CV in profile/cv/ first)\n`);
    console.log(report(checkProfile({}), { label }));
    process.exit(1);
  }
  let profile;
  try {
    profile = readJson(file);
  } catch (e) {
    console.log(`profile:check — ${label} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  const result = checkProfile(profile);
  console.log(report(result, { label }));
  process.exit(result.missing.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("profile-check.mjs")) main();
