#!/usr/bin/env node
/**
 * CV-HTML — the print layout the PDF is made from.
 *
 * A markdown blob in a browser is not a document you can upload; it is a description of one. This
 * file is the actual document.
 *
 * THE FORMAT is a conventional one-page UK student CV:
 *
 *   name centred · contact line pipe-separated · a two-line summary with no heading, then
 *   EDUCATION · SKILLS · RESEARCH · WORK EXPERIENCE · PROJECTS · LEADERSHIP & COLLABORATION ·
 *   TRAINING & ACHIEVEMENTS
 *
 *   Section headings are set in caps with a hairline rule under them. Entries put the organisation
 *   and role on the left and the date hard right. Bullets hang. Skills are one line per group,
 *   "Label: a, b, c". A left-hand label rail looks better and burns a sixth of the page width, which
 *   is most of why a CV runs to two pages — so there is none.
 *
 * It is set in Libre Franklin and Source Serif 4 — one loud face, one quiet one — rather than the
 * word-processor default, which changes nothing structural and stops it reading as a document nobody
 * looked at.
 *
 * IT MUST STAY MACHINE-READABLE. Most applications are read by an applicant tracking system before a
 * human sees them, so: real text (never an image), one linear DOM order, no floating text boxes, no
 * content in page headers or footers, and no letter-spacing (see below). render-pdf.mjs proves this by
 * extracting the text back out of every PDF it writes.
 *
 * IT MUST BE ONE PAGE. This file takes a `fit` argument; render-pdf.mjs walks a tightening ladder
 * until the PDF is one page.
 *
 * Every string this file emits comes from the master profile. It selects and orders; it never writes.
 */

import fs from "node:fs";
import path from "node:path";
import { bestAchievements, matchSkills, period, rank, wantedFor } from "./select.mjs";
import { loadExample, PROJECT_ROOT, readJson } from "./profile.mjs";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Group keys → readable labels. Any other group key is printed with underscores as spaces. */
const SKILL_GROUP_LABELS = {
  programming: "Programming",
  ai_ml_nlp: "AI / ML / NLP",
  web_and_cloud: "Web &amp; Cloud",
  data_and_pipelines: "Data &amp; Pipelines",
  tools_and_practices: "Tools &amp; Practices",
};

/**
 * The skills, one line per group: { key, labelled, ordered }. Anything the posting explicitly named
 * is pulled to the front of its group, so the match is visible without reordering the truth.
 *
 * A group label is printed only when it tells the reader something. With exactly one group, or a
 * group the CV itself calls "Skills" (any case), the SKILLS heading already says it: the CV printed
 * "SKILLS" and then "Skills: Canva, …". With several named groups the labels are as before.
 */
function skillGroups(profile, have) {
  const groups = Object.entries(profile.skills || {}).filter(([k, list]) => !k.startsWith("_") && Array.isArray(list) && list.length);
  return groups.map(([key, list]) => {
    const names = list.map((s) => s.name);
    const ordered = [...names.filter((n) => have.includes(n)), ...names.filter((n) => !have.includes(n))];
    return { key, labelled: groups.length > 1 && key.trim().toLowerCase() !== "skills", ordered };
  });
}

/** The tightening ladder render-pdf.mjs walks to force one page. Step 0 is the comfortable setting. */
export const FIT_STEPS = [
  { size: 9.5, lh: 1.22, bullets: 2, rich: 99, work: 6, projects: 3, note: "comfortable" },
  { size: 9.5, lh: 1.22, bullets: 1, rich: 3, work: 6, projects: 3, note: "full size, two bullets on the top three" },
  { size: 9.5, lh: 1.19, bullets: 1, rich: 0, work: 6, projects: 3, note: "full size, one bullet" },
  { size: 9.5, lh: 1.15, bullets: 1, rich: 0, work: 6, projects: 3, note: "full size, tight leading" },
  { size: 9.3, lh: 1.17, bullets: 1, rich: 0, work: 6, projects: 3, note: "9.3pt, one bullet" },
  { size: 9.1, lh: 1.17, bullets: 1, rich: 0, work: 6, projects: 3, note: "9.1pt, one bullet" },
  { size: 8.9, lh: 1.15, bullets: 1, rich: 0, work: 5, projects: 3, note: "8.9pt, one bullet, five jobs" },
  { size: 8.7, lh: 1.14, bullets: 1, rich: 0, work: 4, projects: 2, note: "8.7pt, one bullet, four jobs, two projects" },
];

/**
 * Fonts are inlined as base64 rather than linked. Chromium subsets and embeds whatever the page
 * actually uses, so the PDF carries its own type and renders identically on a machine that has
 * never heard of Source Serif — which is every recruiter's machine.
 */
function fontFace(dir) {
  const b64 = (f) => fs.readFileSync(path.join(dir, f)).toString("base64");
  const face = (family, file, style, weight) =>
    `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
  return [
    face("Libre Franklin", "LibreFranklin-var.woff2", "normal", "400 700"),
    face("Source Serif 4", "SourceSerif4-var.woff2", "normal", "400 700"),
  ].join("\n");
}

/**
 * NO LETTER-SPACING ON ANYTHING THAT MATTERS. An earlier version tracked the contact line and the
 * section headings, which is the standard way to make small caps look considered. Chromium positions
 * tracked glyphs in separate runs, and the extracted text came back with the email address split
 * into fragments and headings like `EDU C AT I O N` — which an ATS cannot use to segment the document.
 * It looked better and parsed worse, which is the wrong trade for a CV.
 */
const css = (fit) => `
:root{ --ink:#14161a; --grey:#4c4f55; --rule:#b9bcc2; }
@page{ size:A4; margin:10mm 9.5mm 9mm; }
*{ box-sizing:border-box; margin:0; padding:0 }
body{ font-family:"Source Serif 4",Georgia,serif; font-size:${fit.size}pt; line-height:${fit.lh};
  color:var(--ink); -webkit-font-smoothing:antialiased }
a{ color:inherit; text-decoration:none }

.name{ font-family:"Libre Franklin",sans-serif; font-weight:700; font-size:${(fit.size * 1.72).toFixed(1)}pt;
  letter-spacing:-.015em; text-align:center; line-height:1.1 }
.contact{ font-family:"Libre Franklin",sans-serif; font-size:${(fit.size * 0.88).toFixed(1)}pt;
  text-align:center; color:var(--grey); margin-top:.4mm }
.summary{ margin-top:1.4mm }
.auth{ font-size:${(fit.size * 0.93).toFixed(1)}pt; color:var(--grey); margin-top:.6mm }

h2{ font-family:"Libre Franklin",sans-serif; font-weight:700; font-size:${(fit.size * 1.02).toFixed(1)}pt;
  text-transform:uppercase; border-bottom:.6pt solid var(--rule);
  padding-bottom:.4mm; margin:1.7mm 0 .7mm }

.entry{ margin-bottom:.9mm; break-inside:avoid }
.entry:last-child{ margin-bottom:0 }
.head{ display:flex; justify-content:space-between; align-items:baseline; gap:4mm }
.head .what{ font-weight:600 }
.when{ font-family:"Libre Franklin",sans-serif; font-size:${(fit.size * 0.88).toFixed(1)}pt;
  color:var(--grey); white-space:nowrap }
ul{ list-style:none; margin:.1mm 0 0 }
li{ padding-left:3.4mm; text-indent:-3.4mm }
li::before{ content:"• "; color:var(--grey) }
.kv{ padding-left:0 }
.kv b{ font-weight:600 }
`;

const dateOf = (e) => period(e.start, e.end);

export function cvHtml(profile, item, { fontDir, fit = FIT_STEPS[0] }) {
  const id = profile.identity;
  const wanted = wantedFor(profile, item);
  const { have } = matchSkills(profile, item.description);

  const section = (title, body) => (body ? `<section><h2>${title}</h2>${body}</section>` : "");

  const entry = (what, when, bullets) => `<div class="entry">
    <div class="head"><div class="what">${what}</div><div class="when">${esc(when)}</div></div>
    ${bullets.length ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
  </div>`;

  const bulletsOf = (e, i = 99, cap = fit.bullets) =>
    bestAchievements(e, wanted, i < fit.rich ? Math.max(2, cap) : cap).map((a) => a.claim);

  // -- EDUCATION — organisation first --------------------------------------------------------------
  const [uni = {}, school] = profile.education || [];
  const modules = uni.relevant_modules || [];
  const education =
    entry(`${esc(uni.institution)}, ${esc(uni.qualification)}`, dateOf(uni), [
      uni.grade,
      modules.length ? `Relevant classes: ${modules.join(", ")}` : "",
    ].filter(Boolean)) + (school ? entry(esc(school.institution), dateOf(school), [school.grade].filter(Boolean)) : "");

  // -- SKILLS — one line per group (skillGroups above).
  const skills = skillGroups(profile, have)
    .map(({ key: k, labelled, ordered }) =>
      labelled
        ? `<div class="kv"><b>${SKILL_GROUP_LABELS[k] || esc(k.replace(/_/g, " "))}:</b> ${esc(ordered.join(", "))}</div>`
        : `<div class="kv">${esc(ordered.join(", "))}</div>`,
    )
    .join("");

  // -- RESEARCH — its own section above work, for entries marked cv_section: "research" ----------
  const isResearch = (e) => e.cv_section === "research";
  const research = rank((profile.experience || []).filter(isResearch), wanted)
    .map((e, i) => entry(`${esc(e.organisation)} — ${esc(e.title)}`, dateOf(e), bulletsOf(e, i)))
    .join("");

  const work = rank((profile.experience || []).filter((e) => !isResearch(e)), wanted)
    .slice(0, fit.work)
    .map((e, i) => entry(`${esc(e.organisation)} — ${esc(e.title)}`, dateOf(e), bulletsOf(e, i)))
    .join("");

  const projects = rank(profile.projects || [], wanted)
    .slice(0, fit.projects)
    .map((p) => entry(esc(p.name), dateOf(p), bulletsOf(p, 99, 1)))
    .join("");

  const leadership = rank(profile.leadership || [], wanted)
    .map((l) => entry(`${esc(l.title)} — ${esc(l.organisation)}`, dateOf(l), bulletsOf(l, 99, 1)))
    .join("");

  // -- TRAINING & ACHIEVEMENTS — one pipe-separated line. A TODO date is a real
  // gap in the profile, so it is simply omitted rather than guessed at.
  const training = (profile.achievements_other || [])
    .map((a) => `${a.claim}${a.date && !/TODO/.test(a.date) ? ` (${a.date})` : ""}`)
    .join(" | ");

  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<title>${esc(id.name)} — CV — ${esc(item.company)}</title>
<style>${fontFace(fontDir)}${css(fit)}</style></head><body>

<div class="name">${esc(id.name)}</div>
<div class="contact">${[id.email, id.phone, id.links?.portfolio, id.links?.github].filter(Boolean).map(esc).join(" | ")}</div>
<p class="summary">${esc(id.headline)}</p>
<p class="auth">${esc(id.work_authorisation)}</p>

${section("Education", education)}
${section("Skills", skills)}
${section("Research", research)}
${section("Work Experience", work)}
${section("Projects", projects)}
${section("Leadership &amp; Collaboration", leadership)}
${section("Training &amp; Achievements", training ? `<ul><li>${esc(training)}</li></ul>` : "")}

</body></html>`;
}

/**
 * The same CV as plain markdown, for the dashboard's inline "Read the CV" panel and for the grounding
 * check. It takes the same `fit` so that when the layout has to tighten to hold one page, the words on
 * screen are still the words in the file — a CV you read and a CV you send that differ is a trap.
 */
export function cvMarkdown(profile, item, { fit = FIT_STEPS[0] } = {}) {
  const id = profile.identity;
  const wanted = wantedFor(profile, item);
  const { have } = matchSkills(profile, item.description);
  const bulletsOf = (e, i = 99, cap = fit.bullets) =>
    bestAchievements(e, wanted, i < fit.rich ? Math.max(2, cap) : cap).map((a) => `- ${a.claim}`);
  const block = (what, when, bullets) => [`**${what}** · ${when}`, "", ...bullets, ""].join("\n");

  const [uni = {}, school] = profile.education || [];
  const modules = uni.relevant_modules || [];
  const isResearch = (e) => e.cv_section === "research";
  const sec = (title, body) => (body.trim() ? `## ${title}\n\n${body}\n` : "");

  return `# ${id.name}

${[id.email, id.phone, id.links?.portfolio, id.links?.github].filter(Boolean).join(" | ")}

${id.headline}

${id.work_authorisation}

${sec(
  "Education",
  block(`${uni.institution}, ${uni.qualification}`, dateOf(uni), [
    uni.grade ? `- ${uni.grade}` : "",
    modules.length ? `- Relevant classes: ${modules.join(", ")}` : "",
  ].filter(Boolean)) + (school ? block(school.institution, dateOf(school), school.grade ? [`- ${school.grade}`] : []) : ""),
)}
${sec(
  "Skills",
  skillGroups(profile, have)
    .map(({ key: k, labelled, ordered }) =>
      labelled ? `**${(SKILL_GROUP_LABELS[k] || k.replace(/_/g, " ")).replace(/&amp;/g, "&")}:** ${ordered.join(", ")}` : ordered.join(", "),
    )
    .join("\n\n"),
)}
${sec(
  "Research",
  rank((profile.experience || []).filter(isResearch), wanted)
    .map((e, i) => block(`${e.organisation} — ${e.title}`, dateOf(e), bulletsOf(e, i)))
    .join(""),
)}
${sec(
  "Work Experience",
  rank((profile.experience || []).filter((e) => !isResearch(e)), wanted)
    .slice(0, fit.work)
    .map((e, i) => block(`${e.organisation} — ${e.title}`, dateOf(e), bulletsOf(e, i)))
    .join(""),
)}
${sec(
  "Projects",
  rank(profile.projects || [], wanted)
    .slice(0, fit.projects)
    .map((p) => block(p.name, dateOf(p), bulletsOf(p, 99, 1)))
    .join(""),
)}
${sec(
  "Leadership & Collaboration",
  rank(profile.leadership || [], wanted)
    .map((l) => block(`${l.title} — ${l.organisation}`, dateOf(l), bulletsOf(l, 99, 1)))
    .join(""),
)}
${sec(
  "Training & Achievements",
  (profile.achievements_other || [])
    .map((a) => `${a.claim}${a.date && !/TODO/.test(a.date) ? ` (${a.date})` : ""}`)
    .join(" | "),
)}
---

*Ordered for: ${item.title} at ${item.company}. Every line above appears in the master profile —
nothing here is written for this application. This note is for you; the file you upload does not
carry it.*
`;
}

// ------------------------------------------------------------------ self-test
// The skills label rule, both ways, through cvHtml and cvMarkdown themselves. The fictional example
// and the fictional posting only; never the user's profile.
function selfTest() {
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` → ${detail}`}`);
    if (!ok) failed++;
  };
  const fontDir = path.join(PROJECT_ROOT, "assets", "fonts");
  const item = readJson(path.join(PROJECT_ROOT, "scripts", "fixtures", "example-posting.json"));
  const example = loadExample();
  const withSkills = (skills) => ({ ...example, skills: { _help: "fictional", ...skills } });
  const sk = (...names) => names.map((name) => ({ name, evidence: "" }));
  const htmlSkills = (p) => (/<section><h2>Skills<\/h2>([\s\S]*?)<\/section>/.exec(cvHtml(p, item, { fontDir })) || [])[1] ?? null;
  const mdSkills = (p) => (/## Skills\n\n([\s\S]*?)\n## /.exec(cvMarkdown(p, item)) || [])[1] ?? null;

  // Several named groups: today's output, byte for byte. The old formula, inline, is the reference.
  const { have } = matchSkills(example, item.description);
  const oldOrder = (list) => {
    const names = list.map((s) => s.name);
    return [...names.filter((n) => have.includes(n)), ...names.filter((n) => !have.includes(n))];
  };
  const oldGroups = Object.entries(example.skills || {}).filter(([k, list]) => !k.startsWith("_") && Array.isArray(list) && list.length);
  const oldHtml = oldGroups.map(([k, list]) => `<div class="kv"><b>${SKILL_GROUP_LABELS[k] || esc(k.replace(/_/g, " "))}:</b> ${esc(oldOrder(list).join(", "))}</div>`).join("");
  const oldMd = oldGroups.map(([k, list]) => `**${(SKILL_GROUP_LABELS[k] || k.replace(/_/g, " ")).replace(/&amp;/g, "&")}:** ${oldOrder(list).join(", ")}`).join("\n\n");
  check(`several named groups (the example's ${oldGroups.length}) print their labels exactly as before (HTML)`, oldGroups.length > 1 && htmlSkills(example) === oldHtml && /<b>Programming:<\/b>/.test(oldHtml), `${htmlSkills(example)}\n  vs\n${oldHtml}`);
  check("...and in cv.md", mdSkills(example) === `${oldMd}\n` && /\*\*Programming:\*\*/.test(oldMd), JSON.stringify(mdSkills(example)));

  // One group the CV calls "Skills" (a marketing CV's only skills line): no label, in either file.
  const single = withSkills({ Skills: sk("Canva", "Instagram", "TikTok") });
  check(`a single "Skills" group prints its items with no label (HTML)`, htmlSkills(single) === `<div class="kv">Canva, Instagram, TikTok</div>`, htmlSkills(single));
  check("...and in cv.md", mdSkills(single) === "Canva, Instagram, TikTok\n", JSON.stringify(mdSkills(single)));
  // Empty groups left over from an older skeleton do not count as groups.
  const leftover = withSkills({ programming: [], web_and_cloud: [], Skills: sk("Canva", "Instagram") });
  check(`empty leftover groups plus one "Skills" group: still no label`, htmlSkills(leftover) === `<div class="kv">Canva, Instagram</div>` && mdSkills(leftover) === "Canva, Instagram\n", `${htmlSkills(leftover)} | ${JSON.stringify(mdSkills(leftover))}`);
  const onlyOne = withSkills({ programming: sk("Python", "SQL") });
  check("exactly one group of any name prints no label", htmlSkills(onlyOne) === `<div class="kv">Python, SQL</div>` && !/Programming/.test(cvMarkdown(onlyOne, item)), htmlSkills(onlyOne));
  // A "skills" group among named ones loses only its own label.
  const mixed = withSkills({ skills: sk("Canva"), languages: sk("French") });
  check(`a "skills" group among several named groups prints unlabelled; the others keep their labels`, htmlSkills(mixed) === `<div class="kv">Canva</div><div class="kv"><b>languages:</b> French</div>` && mdSkills(mixed) === "Canva\n\n**languages:** French\n", `${htmlSkills(mixed)} | ${JSON.stringify(mdSkills(mixed))}`);

  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — one group or a \"Skills\" group prints no label; several named groups print theirs as before");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("cv-html.mjs") && process.argv.includes("--self-test")) selfTest();
