#!/usr/bin/env node
/**
 * SETUP — a terminal quiz that builds your profile, one question at a time. No AI needed.
 *
 *   npm run setup               ask for everything profile/master-profile.json is missing
 *   npm run setup < answers.txt the same, driven by a file (one answer per line)
 *   node scripts/setup.mjs --self-test
 *
 * How it behaves:
 *   - If profile/master-profile.json (or CAREER_AGENT_PROFILE) does not exist, it starts from the
 *     SHAPE of the fictional example with every value emptied. Nothing from the example is kept.
 *   - It asks only what `npm run profile:check` would still flag — required fields first, then the
 *     recommended ones — each with the reason the tool needs it.
 *   - Type `skip` (or press Enter) to leave a question for later. It is saved after EVERY answer, so
 *     you can stop at any point and run it again to carry on where you left off.
 *   - It never invents anything. What you type is what is saved; a skipped field stays empty.
 *   - It ends by running the same check as `npm run profile:check`, and exits with its result.
 *
 * The questions and their reasons live in scripts/profile-check.mjs (FIELDS), so the quiz and the
 * check can never disagree about what a complete profile is.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FIELDS, answered, checkProfile, get, isDate, report, set } from "./profile-check.mjs";
import { loadExample, profilePath, readJson } from "./profile.mjs";

const SKIP = /^\s*(skip|s|-)?\s*$/i;
const NONE = /^\s*(none|no|n\/a|nothing)\s*$/i;
const YES = /^\s*y(es)?\s*$/i;
const EMPLOYER_CLASSES = ["bank", "big-tech", "quant", "research", "tech-platform", "consultancy", "non-technical", "other"];

/** The example's shape with every value emptied. `_help` notes are kept — they are documentation. */
export function emptyLike(v, key = "") {
  if (key.startsWith("_")) return v;
  if (typeof v === "string") return "";
  if (typeof v === "number") return null;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyLike(x, k)]));
  return v;
}

export function skeleton() {
  const s = emptyLike(loadExample());
  s._README = [
    "YOUR profile. It is gitignored: keep it that way, and never paste it into a public repository.",
    "Every CV line and form answer this tool writes must trace back to a string in here; `npm run ground` fails anything else.",
    "Fill it with `npm run setup` or `/career-onboard`, then run `npm run profile:check`.",
  ];
  return s;
}

// ------------------------------------------------------------------ input, one line at a time
// Works the same for a person at a terminal and for a piped answers file: each answer is one line.
class EndOfInput extends Error {}

function lineReader() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => waiters.push(r)));
  return { next, close: () => rl.close() };
}

async function main() {
  const file = profilePath();
  const fresh = !fs.existsSync(file);
  let profile;
  try {
    profile = fresh ? skeleton() : readJson(file);
  } catch (e) {
    console.error(`setup: ${file} is not valid JSON (${e.message}). Fix or move it, then run setup again.`);
    process.exit(2);
  }
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profile, null, 2) + "\n");
  };
  const piped = !process.stdin.isTTY;
  const input = lineReader();
  let n = 0;

  console.log(`career-agent setup — ${fresh ? "creating" : "completing"} ${path.relative(process.cwd(), file) || file}`);
  console.log(`One question at a time. Type "skip" or press Enter to leave one for later. Saved after every answer.\n`);
  if (fresh) save();

  /** Ask one question; returns the trimmed answer, or null when skipped. */
  const ask = async (label, prompt, why) => {
    n++;
    console.log(`\n[${n}] ${label}\n  ${prompt}${why ? `\n  why: ${why}` : ""}`);
    process.stdout.write("> ");
    const line = await input.next();
    if (line === null) throw new EndOfInput();
    if (piped) process.stdout.write(`${line}\n`);
    return SKIP.test(line) ? null : line.trim();
  };
  /** A follow-up inside an entry: same input, no new number, no reason line. */
  const sub = async (prompt) => {
    process.stdout.write(`  ${prompt}\n> `);
    const line = await input.next();
    if (line === null) throw new EndOfInput();
    if (piped) process.stdout.write(`${line}\n`);
    return SKIP.test(line) ? null : line.trim();
  };
  const notDate = (v, allowPresent) => `  "${v}" is not ${allowPresent ? "YYYY-MM or present" : "YYYY-MM"}`;
  const subDate = async (prompt, allowPresent) => {
    for (let i = 0; i < 3; i++) {
      const v = await sub(prompt);
      if (v == null) return null;
      if (isDate(v, allowPresent)) return v;
      console.log(`${notDate(v, allowPresent)} — try again, or type skip.`);
    }
    return null;
  };
  const splitList = (s) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

  /** Achievements for one entry: what you did, the measurable outcome, the skills, the evidence. */
  const askAchievements = async (entry) => {
    entry.achievements = Array.isArray(entry.achievements) ? entry.achievements.filter((a) => a?.claim) : [];
    for (let k = entry.achievements.length + 1; ; k++) {
      let claim = await sub(`Achievement ${k}: what did you do, and what changed because of it? Include the number (users, time saved, %, money). Blank when you have no more.`);
      if (!claim) break;
      if (!/\d/.test(claim)) {
        const better = await sub(`That has no number in it, and the grounding check only lets a CV state numbers that are in your profile. Rewrite it with the number or outcome, or press Enter to keep it as written:`);
        if (better) claim = better;
      }
      const skills = await sub("Skills it used (comma-separated):");
      const evidence = await sub("Where can it be checked? (a link, a manager, a certificate):");
      entry.achievements.push({ claim, skills: skills ? splitList(skills) : [], evidence: evidence || "" });
      save();
    }
  };

  /** One experience / project / leadership entry, asking only the parts that are missing. */
  const fillEntry = async (kind, entry) => {
    const nameKeys = kind === "projects" ? [["name", "Project name"]] : [["organisation", "Organisation"], ["title", "Your role / title"]];
    for (const [k, label] of nameKeys) if (!entry[k]) { entry[k] = (await sub(`${label}:`)) || ""; save(); }
    if (!entry.start) { entry.start = (await subDate("Start (YYYY-MM):", false)) || ""; save(); }
    if (!entry.end) { entry.end = (await subDate("End (YYYY-MM, or present):", true)) || ""; save(); }
    if (kind === "experience" && entry.location === undefined) { entry.location = (await sub("Location (city):")) || ""; save(); }
    if (kind !== "leadership" && entry.summary === undefined) { entry.summary = (await sub("One-line summary (no numbers needed here):")) || ""; save(); }
    if (!(entry.achievements || []).some((a) => a?.claim)) await askAchievements(entry);
  };

  const ENTRY_LABEL = { experience: "work, research or volunteering entry", projects: "project", leadership: "leadership, teaching or organising entry" };
  const entriesNeeded = !((profile.experience || []).length + (profile.projects || []).length);

  const askEntries = async (f) => {
    const kind = f.kind;
    profile[kind] = Array.isArray(profile[kind]) ? profile[kind] : [];
    // Existing entries (from /career-onboard, or a previous run) get their missing parts asked first.
    for (const [i, e] of profile[kind].entries()) {
      const r = checkProfile({ [kind]: [e] });
      if (r.missing.some((m) => m.path.startsWith(`${kind}[0]`))) {
        await ask(`${kind}[${i}]`, `Finishing "${e.name || e.organisation || e.title || `entry ${i + 1}`}" — it is missing dates or an achievement.`, f.why);
        await fillEntry(kind, e);
      }
    }
    // New entries are offered when the profile has none of this kind and still needs them.
    const offer = kind === "leadership" ? !profile[kind].length : entriesNeeded;
    if (!offer) return;
    let more = await ask(kind, `Add a ${ENTRY_LABEL[kind]}? (yes/no)`, f.why);
    while (more && YES.test(more)) {
      const e = kind === "projects" ? { id: `proj-${profile[kind].length + 1}` } : { id: `${kind === "experience" ? "exp" : "lead"}-${profile[kind].length + 1}` };
      profile[kind].push(e);
      await fillEntry(kind, e);
      save();
      more = await sub(`Add another ${ENTRY_LABEL[kind]}? (yes/no)`);
    }
  };

  const askField = async (f) => {
    const label = `${f.path}${f.level === "required" ? "" : "  (recommended)"}`;
    switch (f.kind) {
      case "text": {
        const v = await ask(label, f.ask, f.why);
        if (v != null) set(profile, f.path, v);
        break;
      }
      case "date": {
        // Same rule and message as the experience dates: three tries, then left for later. A saved
        // value that is not a date (from an older run, or typed into the file) is shown and replaced.
        const saved = get(profile, f.path);
        const note = typeof saved === "string" && saved.trim() ? `\n  Saved now: "${saved}" — not a date the CV can print, so answer again.` : "";
        let v = await ask(label, `${f.ask}${note}`, f.why);
        for (let i = 1; v != null && !isDate(v, f.allowPresent); i++) {
          if (i === 3) {
            console.log(`${notDate(v, f.allowPresent)} — left unanswered. Run npm run setup again to answer it.`);
            v = null;
            break;
          }
          console.log(`${notDate(v, f.allowPresent)} — try again, or type skip.`);
          v = await sub(`${f.ask}:`);
        }
        if (v != null) set(profile, f.path, v);
        break;
      }
      case "number": {
        let v = await ask(label, f.ask, f.why);
        for (let i = 0; v != null && !(Number.isInteger(Number(v)) && Number(v) > 1900 && Number(v) < 2200) && i < 2; i++)
          v = await sub(`"${v}" is not a year — try again, or type skip:`);
        if (v != null && Number.isInteger(Number(v)) && Number(v) > 1900 && Number(v) < 2200) set(profile, f.path, Number(v));
        break;
      }
      case "list": {
        const v = await ask(label, f.ask, f.why);
        if (v != null) set(profile, f.path, splitList(v));
        break;
      }
      case "lines": {
        const items = [];
        const v = await ask(label, `${f.ask}. One per line; a blank line finishes.`, f.why);
        if (v != null) {
          items.push(v);
          set(profile, f.path, items);
          save();
          for (let more = await sub(`Another? (blank to finish)`); more; more = await sub(`Another? (blank to finish)`)) {
            items.push(more);
            save();
          }
        }
        break;
      }
      case "pair": {
        const v = await ask(label, f.ask, f.why);
        if (v != null) {
          const answer = YES.test(v) ? "Yes" : /^\s*no?\s*$/i.test(v) ? "No" : v;
          set(profile, f.path, { answer, detail: "" });
          save();
          const detail = await sub("One line of detail (optional):");
          set(profile, f.path, { answer, detail: detail || "" });
        }
        break;
      }
      case "offer": {
        const v = await ask(label, f.ask, f.why);
        if (v == null) break;
        if (NONE.test(v)) { set(profile, f.path, null); break; }
        const offer = { employer: v, employer_class: "", hourly_usd: null, note: "" };
        set(profile, f.path, offer);
        save();
        const cls = await sub(`What kind of employer is it? One of: ${EMPLOYER_CLASSES.join(", ")}`);
        offer.employer_class = cls && EMPLOYER_CLASSES.includes(cls.toLowerCase()) ? cls.toLowerCase() : "other";
        save();
        const pay = await sub("Its hourly rate in US dollars, if you know it (a number, or skip):");
        if (pay && Number.isFinite(Number(pay))) offer.hourly_usd = Number(pay);
        save();
        offer.note = (await sub("One line about it (dates, status):")) || "";
        break;
      }
      case "skills": {
        profile.skills = profile.skills && typeof profile.skills === "object" ? profile.skills : {};
        let group = await ask(label, "Skill group name (e.g. programming, web_and_cloud, data_and_pipelines, tools_and_practices). Blank to finish.", f.why);
        while (group) {
          const key = group.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          const names = await sub(`Skills in ${key}, comma-separated (only ones you can show):`);
          const evidence = names ? await sub(`Where can these be seen? (projects, coursework, jobs):`) : null;
          if (names) profile.skills[key] = [...(profile.skills[key] || []), ...splitList(names).map((name) => ({ name, evidence: evidence || "" }))];
          save();
          group = await sub("Next skill group name (blank to finish):");
        }
        break;
      }
      case "referees": {
        profile.referees = profile.referees && typeof profile.referees === "object" ? profile.referees : {};
        profile.referees.items = Array.isArray(profile.referees.items) ? profile.referees.items : [];
        let more = await ask(label, "Add a referee who has agreed to give you a reference? (yes/no)", f.why);
        while (more && YES.test(more)) {
          const r = { id: `ref-${profile.referees.items.length + 1}` };
          for (const [k, q] of [["name", "Their name:"], ["email", "Their email:"], ["phone", "Their phone (or skip):"], ["position", "Their job title:"], ["organisation", "Their organisation:"], ["relationship", "How they know you:"]])
            r[k] = (await sub(q)) || "";
          const consent = await sub(`Have they agreed? Type "given YYYY-MM-DD" if yes, or skip:`);
          r.consent = consent || "NOT RECORDED — ask before listing them";
          const scope = await sub("Which applications are they for? technical, non_technical or both:");
          r.scope = ["technical", "non_technical", "both"].includes(String(scope).toLowerCase()) ? scope.toLowerCase() : "both";
          profile.referees.items.push(r);
          save();
          more = await sub("Add another referee? (yes/no)");
        }
        break;
      }
      case "experience":
      case "projects":
      case "leadership":
        await askEntries(f);
        break;
    }
    save();
  };

  let ended = false;
  try {
    for (const level of ["required", "recommended"]) {
      if (level === "recommended") console.log(`\n— Required questions done. The rest are recommended: each one fills a form box or sharpens the ranking. —`);
      for (const f of FIELDS.filter((x) => x.level === level)) {
        const isEntries = ["experience", "projects", "leadership"].includes(f.kind);
        if (isEntries || !answered(profile, f)) await askField(f);
      }
    }
  } catch (e) {
    if (!(e instanceof EndOfInput)) throw e;
    ended = true;
  }
  input.close();
  save();
  if (ended) console.log(`\n\nInput ended — everything answered so far is saved. Run npm run setup again to carry on.`);

  console.log(`\n${"─".repeat(78)}\nRunning npm run profile:check …\n`);
  const result = checkProfile(profile);
  console.log(report(result, { label: path.relative(process.cwd(), file) || file }));
  if (!result.missing.length) console.log(`\nNext: npm test, then npm run discover (see README → the daily loop).`);
  process.exit(result.missing.length ? 1 : 0);
}

// ------------------------------------------------------------------ self-test
// Drives the real CLI with piped stdin, exactly as `npm run setup < answers.txt` would, into a
// temporary profile path. Never touches profile/master-profile.json.
export const SAMPLE_ANSWERS = [
  // required
  "Sam Tester", "sam@example.org", "+44 20 7946 0999", "Leeds, UK", "Maths student who builds small data tools.",
  "UK citizen; no visa sponsorship needed", "United Kingdom, UK, England", "Data analyst intern, Software developer intern",
  "Leeds, York", "summer", "2031",
  "Testshire University", "BSc Mathematics", "Mathematics", "2027-09", "2032-06", "2032", "Third year of four", "Predicted 2:1, 65% average",
  // experience: one entry, one achievement
  "yes", "Testshire Council", "Data Volunteer", "2029-06", "2029-09", "Leeds", "Summer volunteering with the council data team.",
  "Cleaned 3 years of bus-stop survey data for a public map", "Python, Excel", "Council volunteer letter", "", "no",
  // projects: none
  "no",
  // skills: one group
  "programming", "Python, R", "Coursework and volunteering", "",
  // gaps
  "No paid software job yet", "",
  // recommended
  "https://www.linkedin.com/in/sam-tester", "https://github.com/sam-tester", "https://sam.example.org",
  "2 Test Road", "Leeds", "LS1 1AA", "United Kingdom", "Technology", "Leeds", "data, python", "none", "Statistics, Programming",
  // leadership: one entry
  "yes", "Testshire Maths Society", "Treasurer", "2029-09", "present", "Managed a 1,200 pound society budget across 8 events", "Budgeting", "Society accounts", "", "no",
  "The hardest problem was matching 3 years of survey files with different column names; I wrote a Python mapping table and checked row counts against the originals.",
  "I like tidy data and clear charts.", "",
  // referees: one
  "yes", "Pat Example", "pat@example.org", "+44 20 7946 0555", "Data Officer", "Testshire Council", "Volunteer supervisor", "given 2029-10-01", "both", "no",
  // logistics
  "Weekends and university holidays", "None, I am a student", "UK passport", "No", "I use buses", "Yes", "",
];
export const GRAD_YEAR_INDEX = SAMPLE_ANSWERS.indexOf("2032", SAMPLE_ANSWERS.indexOf("2032-06"));
export const EDU_START_INDEX = SAMPLE_ANSWERS.indexOf("2027-09");
export const EDU_END_INDEX = SAMPLE_ANSWERS.indexOf("2032-06");

function selfTest() {
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` → ${detail}`}`);
    if (!ok) failed++;
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "setup-selftest-"));
  const run = (file, answers) =>
    spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      input: answers.join("\n") + "\n",
      env: { ...process.env, CAREER_AGENT_PROFILE: file },
      encoding: "utf8",
    });
  const questions = (out) => (out.match(/^\[\d+\] /gm) || []).length;

  try {
    // 1. A full set of answers → a profile that passes the check.
    const full = path.join(tmp, "full.json");
    const a = run(full, SAMPLE_ANSWERS);
    const pa = fs.existsSync(full) ? readJson(full) : {};
    check("full answers → exit 0", a.status === 0, `exit ${a.status}\n${a.stdout.slice(-1500)}`);
    check("full answers → profile:check passes", checkProfile(pa).missing.length === 0, JSON.stringify(checkProfile(pa).missing));
    check("...with no recommendations left either", checkProfile(pa).weak.length === 0, JSON.stringify(checkProfile(pa).weak.map((w) => w.path)));
    check("what was typed is what was saved", pa.identity?.name === "Sam Tester" && pa.education?.[0]?.graduation_year === 2032 && pa.experience?.[0]?.achievements?.[0]?.claim.startsWith("Cleaned 3 years"), JSON.stringify(pa.identity));
    check("each question shows why it is asked", /why: eligibility\.mjs compares it with your intake year/.test(a.stdout), "no why line");
    const exampleStrings = [];
    const walk = (v, k = "") => { if (typeof v === "string" && !k.startsWith("_") && v.length > 3) exampleStrings.push(v); else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk); };
    walk(loadExample());
    // A string counts as leaked when it is in the saved profile but was never typed by the user.
    const typed = SAMPLE_ANSWERS.join("\n");
    const leaked = exampleStrings.filter((s) => JSON.stringify(pa).includes(JSON.stringify(s)) && !typed.includes(s));
    check("NOTHING from the fictional example leaks into a real profile (it never invents)", leaked.length === 0, JSON.stringify(leaked.slice(0, 5)));
    const self = exampleStrings.filter((s) => JSON.stringify(loadExample()).includes(JSON.stringify(s)) && !typed.includes(s));
    check("...and that leak check fires when pointed at the example itself", self.length > 20, `found ${self.length}`);

    // 2. One required answer skipped → profile:check reports exactly that field.
    const skipped = path.join(tmp, "skipped.json");
    const answers = [...SAMPLE_ANSWERS];
    answers[GRAD_YEAR_INDEX] = "skip";
    const b = run(skipped, answers);
    const pb = readJson(skipped);
    const rb = checkProfile(pb);
    check("one skipped required answer → exit 1", b.status === 1, `exit ${b.status}`);
    check("...and profile:check reports exactly that field", rb.missing.length === 1 && rb.missing[0].path === "education[0].graduation_year", JSON.stringify(rb.missing.map((m) => m.path)));
    check("...and the skipped field stays EMPTY rather than guessed", pb.education[0].graduation_year == null, JSON.stringify(pb.education[0].graduation_year));

    // 3. Resume: running again asks only what is still missing.
    const c = run(skipped, ["2032"]);
    check("resume: a second run asks exactly one question", questions(c.stdout) === 1, `asked ${questions(c.stdout)}\n${c.stdout.slice(0, 800)}`);
    check("resume: ...and the profile now passes", c.status === 0 && checkProfile(readJson(skipped)).missing.length === 0, `exit ${c.status}`);

    // 4. Input that stops halfway still leaves every answer given so far on disk.
    const half = path.join(tmp, "half.json");
    const d = run(half, SAMPLE_ANSWERS.slice(0, 5));
    const pd = readJson(half);
    check("input ending halfway → progress saved", pd.identity?.headline === SAMPLE_ANSWERS[4] && /Input ended/.test(d.stdout), JSON.stringify(pd.identity));
    check("...and the run says what is still missing (exit 1)", d.status === 1 && /education\[0\]\.graduation_year/.test(d.stdout), `exit ${d.status}`);

    // 5. Bad input is refused, not stored: a non-year and a malformed date are asked again.
    const bad = path.join(tmp, "bad.json");
    const badAnswers = [...SAMPLE_ANSWERS];
    badAnswers.splice(GRAD_YEAR_INDEX, 1, "next year", "2032");
    const e = run(bad, badAnswers);
    check("a non-year is asked again rather than saved", e.status === 0 && readJson(bad).education[0].graduation_year === 2032, `exit ${e.status}`);

    // 6. Education dates take the same YYYY-MM rule as experience dates: free text is refused with
    //    "is not YYYY-MM — try again", never saved, and a valid answer after it is.
    const freeStart = path.join(tmp, "free-start.json");
    const fsAnswers = [...SAMPLE_ANSWERS];
    fsAnswers.splice(EDU_START_INDEX, 1, "sometime in autumn", "2027-09");
    const f6 = run(freeStart, fsAnswers);
    check("education start: free text → \"is not YYYY-MM — try again\"", f6.stdout.includes(`"sometime in autumn" is not YYYY-MM — try again`), f6.stdout.slice(0, 2500));
    check("...then the valid answer is saved and the profile passes (exit 0)", f6.status === 0 && readJson(freeStart).education[0].start === "2027-09", `exit ${f6.status}, start ${JSON.stringify(readJson(freeStart).education?.[0]?.start)}`);
    const freeEnd = path.join(tmp, "free-end.json");
    const feAnswers = [...SAMPLE_ANSWERS];
    feAnswers.splice(EDU_END_INDEX, 1, "summer 2032", "2032-06");
    const f7 = run(freeEnd, feAnswers);
    check("education end: free text is asked again, then the valid answer is saved", /"summer 2032" is not YYYY-MM or present — try again/.test(f7.stdout) && f7.status === 0 && readJson(freeEnd).education[0].end === "2032-06", `exit ${f7.status}`);
    const neverDate = path.join(tmp, "never-date.json");
    const ndAnswers = [...SAMPLE_ANSWERS];
    ndAnswers.splice(EDU_START_INDEX, 1, "sometime in autumn", "autumn 2027", "Sept 2027");
    const f8 = run(neverDate, ndAnswers);
    const r8 = checkProfile(readJson(neverDate));
    check("three free-text starts → nothing saved, exit 1, and profile:check reports exactly education[0].start", f8.status === 1 && !readJson(neverDate).education[0].start && r8.missing.length === 1 && r8.missing[0].path === "education[0].start", `exit ${f8.status}, start ${JSON.stringify(readJson(neverDate).education?.[0]?.start)}, missing ${JSON.stringify(r8.missing.map((m) => m.path))}`);
    // A free-text start already in the file (an older run, or typed in by hand) is asked again, once.
    const resumeFree = path.join(tmp, "resume-free.json");
    const pr = readJson(full);
    pr.education[0].start = "sometime in autumn";
    fs.writeFileSync(resumeFree, JSON.stringify(pr, null, 2));
    const f9 = run(resumeFree, ["2027-09"]);
    check("resume: a saved free-text start is the one question asked, and it shows the saved value", questions(f9.stdout) === 1 && /\[1\] education\[0\]\.start/.test(f9.stdout) && f9.stdout.includes(`Saved now: "sometime in autumn"`), f9.stdout.slice(0, 800));
    check("resume: ...and the valid answer replaces it (exit 0)", f9.status === 0 && readJson(resumeFree).education[0].start === "2027-09", `exit ${f9.status}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — piped answers build a passing profile, a skipped answer is reported exactly, and resume asks only what is missing");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("setup.mjs")) {
  if (process.argv.includes("--self-test")) selfTest();
  else main();
}
