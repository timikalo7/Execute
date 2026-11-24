#!/usr/bin/env node
/**
 * COWORK BRIEF — the handover file for an assistant (for example a Claude Cowork session) that fills
 * a form in YOUR browser while you watch.
 *
 * `apply.mjs` fills forms it can match, but a live employer form behind a bot check is often easier
 * to fill by an assistant driving your own everyday browser. `answers.md` was written for a person to
 * read and paste from. An assistant is a different reader: it needs the target, the exact values, the
 * path of the file to attach, and an unambiguous stopping rule — in one file, with nothing to
 * interpret.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE ANSWER SHEET:
 *   - absolute paths, because an agent driving a browser cannot guess where the repo is;
 *   - one FIELD → VALUE table, no prose between the agent and the value;
 *   - the stopping rule first, not last;
 *   - the honeypot finding, because it is the one thing that silently ruins a submission;
 *   - and everything the profile does NOT know, listed as questions to ask you, so the session stops
 *     and asks instead of inventing.
 *
 * Nothing here is invented: every value comes from `master-profile.json` or the generated answers,
 * both of which `ground-check.mjs` already guards.
 *
 *   node scripts/cowork-brief.mjs          write output/<slug>/COWORK.md for every live opportunity
 *   node scripts/cowork-brief.mjs <slug>   just one
 */

import fs from "node:fs";
import path from "node:path";
import { assess } from "./eligibility.mjs";
import { rank } from "./bar.mjs";
import { answerBlocks } from "./answers.mjs";
import { cvVariantFor, loadFound, pdfNameFor, slugFor } from "./tailor.mjs";
import { period } from "./select.mjs";
import { decisions, isDecided } from "./decisions.mjs";
import { barConfig, barLabel, inRange, intakeLabel, loadProfile, offerToBeat, targetCountries } from "./profile.mjs";

const ROOT = process.cwd();

/** Everything the form needs that is pure lookup, as one table an agent can work straight down. */
function fieldTable(profile, item) {
  const id = profile.identity;
  const a = id.address || {};
  const uni = profile.education[0];
  const school = profile.education.find((e) => /school|college|academy/i.test(e.institution) && e !== uni);
  const [first, ...rest] = id.name.split(/\s+/);
  // Authorised here = the posting is in a country or city your profile lists (target.countries /
  // target.locations). Anything else is CHECK, never a guessed Yes.
  const here = targetCountries(profile).length > 0 && (!item.location || inRange(item.location, profile));
  const log = profile.logistics || {};

  const rows = [
    ["First name", first],
    ["Last name", rest.join(" ")],
    ["Full name", id.name],
    ["Email", id.email],
    ["Phone", id.phone],
    ["Address line 1", a.line1],
    ["City", a.city],
    ["Postcode", a.postcode],
    ["Country", a.country],
    ["LinkedIn", id.links.linkedin],
    ["GitHub", id.links.github],
    ["Portfolio / website", id.links.portfolio],
    ["University", uni.institution],
    ["Degree", uni.qualification],
    ["Course dates", period(uni.start, uni.end)],
    ["Expected graduation", period(uni.end, uni.end)],
    ["Expected grade", uni.grade],
    ["Year of study", uni.year_of_study || "—"],
    ["Secondary school", school ? school.institution : "—"],
    ["School results", school ? school.grade : "—"],
    ["Eligible to work in this country?", here ? "Yes" : "CHECK"],
    ["Require visa sponsorship?", here ? "No" : "CHECK"],
    ["Currently a student?", "Yes"],
    ["Notice period", log.notice_period || "None — student"],
    ["Own transport?", log.own_transport ? log.own_transport.answer : "ASK THE USER"],
    ["Over 18?", log.over_18 ? log.over_18.answer : "ASK THE USER"],
  ];
  return `| Field the form asks for | Type exactly this |\n|---|---|\n${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n")}`;
}

/** The things nobody should invent. An agent that hits one of these stops and asks. */
function askTheUser(profile, item) {
  const out = [
    "**Date of birth** — deliberately not stored in this repo. Ask, do not guess.",
    "**National Insurance number / passport number** — same. Offer stage only.",
  ];
  if (cvVariantFor(item) === "normal" && profile.logistics?.background_check) {
    out.push("**Background check certificate number (DBS/PVG)** — never stored here. Ask.");
  }
  const refs = (profile.referees?.items || []).filter((r) => (r.scope || "both") !== (cvVariantFor(item) === "normal" ? "technical" : "non_technical"));
  const unasked = refs.filter((r) => !/^\s*given\b/i.test(String(r.consent || "")));
  if (unasked.length)
    out.push(`**Referees** — ${unasked.map((r) => r.name).join(" and ")} ${unasked.length === 1 ? "has" : "have"} not agreed yet. Do not list them until the user says they have.`);
  return out.map((s) => `- ${s}`).join("\n");
}

function brief(profile, item) {
  const slug = slugFor(item);
  const dir = path.join(ROOT, "output", slug);
  const pdf = path.join(dir, pdfNameFor(item));
  const variant = cvVariantFor(item);
  const docs = variant === "normal" ? null : answerBlocks(profile, item);
  const el = item.eligibility || {};

  // The prose answers. For a technical pack they come from answerBlocks; for a NON-TECHNICAL pack the
  // generator lives inside normalSheet, so rather than duplicate it the brief lifts the ```paste
  // blocks straight out of the answers.md already written in the same folder. Same words, one source,
  // and they stay grounding-checked here for the same reason they are checked there — a brief with no
  // paste blocks is reported NOT-CHECKED, which is how this gap was found rather than shipped.
  const free =
    docs
      ? [
          ["Why this role / why us", docs.whyUs],
          ["Why you — what makes you a good fit", docs.whyYou],
          ["Hardest technical challenge", docs.hardest],
          ["Working in a team / leading something", docs.teamwork],
          ["What do you want to get out of it", docs.learning],
        ].filter(([, v]) => v && v.trim())
      : (() => {
          const sheet = path.join(dir, "answers.md");
          if (!fs.existsSync(sheet)) return [];
          const md = fs.readFileSync(sheet, "utf8");
          const out = [];
          // Each paste block, labelled with the nearest heading above it.
          for (const m of md.matchAll(/(^#{2,4} (.+)$)?[\s\S]*?^```paste[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
            const body = m[3]?.trim();
            if (body) out.push([m[2]?.trim() || "Answer", body]);
          }
          return out;
        })();

  return `# Cowork brief — ${item.company}: ${item.title}

**Paste this whole file into an assistant session (for example Claude Cowork) on your own PC.** It is
written for an agent driving a real browser, not for a person to read and retype.

---

## STOP RULES — read these first

1. **Do not press submit.** Fill everything, then hand back and let the user read it. Submitting is
   the user's click, always.
2. **Never type into a password field.** If the site wants an account, ask the user to log in.
3. **Never invent a value.** Everything you need is below. If the form asks something that is not
   here, stop and ask — the list of known unknowns is at the bottom.
4. **If the page says "there was an error verifying your application"**, the site's own JavaScript had
   not finished arming the form. Reload, wait for it to settle fully, and fill it again. This is
   timing, not the browser — measured on Teamtailor, whose script deletes a hidden \`city\` honeypot
   field on load and whose server rejects the post if that field is still there.

---

## The target

- **Apply at:** ${item.url}
${item.needs_account ? `- **Account needed first:** ${item.needs_account}\n` : ""}${item.deadline ? `- **Deadline:** ${item.deadline}\n` : ""}- **Against ${barLabel(profile)}:** ${item.bar?.tier || "not ranked"}${item.bar?.reasons?.length ? `\n${item.bar.reasons.map((r) => `  - ${r}`).join("\n")}` : ""}
- **Eligibility verdict from the board:** ${el.verdict || "unknown"}${el.unclear?.length ? `\n- **Unclear, worth the user's eyes:** ${el.unclear.join("; ")}` : ""}

## The CV to attach

\`\`\`
projects/career-agent/output/${slug}/${pdfNameFor(item)}
\`\`\`

That path is relative to the repo root — the Cowork session is running inside the repo, so it can
resolve it. It is written relative rather than absolute on purpose: this file is generated in a Linux
container and used on a Windows machine, and an absolute path from the wrong one of those is a broken
path that looks authoritative.

${variant === "normal" ? "**This is the user's NON-TECHNICAL CV**, used verbatim. Do not attach the technical one." : "Tailored to this posting specifically. One page, text-extractable, checked."}
${fs.existsSync(pdf) ? "" : "\n**WARNING: that file does not exist yet. Run `npm run daily` first.**\n"}
---

## Fields

${fieldTable(profile, item)}

*Every value in that table is read straight out of the master profile — a lookup, not composed prose,
so there is nothing in it for a model to have invented. The prose answers further down ARE composed,
which is why those sit inside paste blocks and are what the grounding check reads.*

${
  item.form_answers?.length
    ? `### Answers this employer specifically needs\n\nThe user declared these against this posting. They are true and they are not guesses.\n\n\`\`\`paste\n| If the form asks about… | Answer |\n|---|---|\n${item.form_answers.map(([re, v]) => `| ${re} | ${v === null ? "leave blank" : v} |`).join("\n")}\n\`\`\`\n`
    : ""
}
${
  free && free.length
    ? `---\n\n## Free-text answers — paste verbatim\n\n${free.map(([q, a]) => `### ${q}\n\n\`\`\`paste\n${a}\n\`\`\`\n`).join("\n")}`
    : ""
}
---

## Ask the user — do not guess these

${askTheUser(profile, item)}

---

## When you are done

Report back as a list: every field you filled and what you put in it, then every field you could not.
The user reads that before anything is sent.

*Generated by \`node scripts/cowork-brief.mjs\` from \`profile/master-profile.json\`. Every claim above
traces to that file — \`npm run ground\` fails the build otherwise.*
`;
}

function main() {
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const profile = loadProfile();
  const found = loadFound();
  // Same decided-set the dashboard filters on. If these two disagree, you see a posting in the brief
  // that the dashboard already hid.
  const decidedSet = decisions(ROOT);
  found.jobs = found.jobs.filter((j) => !isDecided(decidedSet, j.url));

  for (const j of found.jobs) if (!j.eligibility) j.eligibility = assess(j, { profile });
  let items = found.jobs.filter((j) => j.eligibility.verdict !== "ineligible");
  if (only) items = items.filter((j) => slugFor(j) === only);
  if (!items.length) {
    console.error(only ? `cowork-brief: no live opportunity with slug ${only}` : "cowork-brief: nothing live to write");
    process.exit(2);
  }

  let n = 0;
  for (const item of items) {
    const dir = path.join(ROOT, "output", slugFor(item));
    if (!fs.existsSync(dir)) continue;
    fs.writeFileSync(path.join(dir, "COWORK.md"), brief(profile, item));
    n++;
  }

  // The queue, so you open one file and work down it rather than hunting folders.
  //
  // Ordered by YOUR bar, not just by deadline: a queue sorted purely by what closes soonest spends the
  // scarcest thing — evenings — on sideways moves. The rest stays visible underneath.
  for (const i of items) if (!i.bar) i.bar = rank(i, barConfig(profile));
  const offer = offerToBeat(profile);
  const pri = items.filter((i) => i.priority).sort((a, b) => a.priority - b.priority);
  const byDeadline = (a, b) => (a.deadline_date || "9").localeCompare(b.deadline_date || "9");
  const upgrades = items.filter((i) => !i.priority && i.bar?.tier === "beats").sort(byDeadline);
  const rest = items.filter((i) => !i.priority && i.bar?.tier !== "beats").sort(byDeadline);
  const line = (i) => `- **${i.company} — ${i.title}**${i.deadline ? `  \n  _${i.deadline}_` : ""}  \n  ${i.url}  \n  brief: \`output/${slugFor(i)}/COWORK.md\``;
  fs.writeFileSync(
    path.join(ROOT, "COWORK-QUEUE.md"),
    `# Cowork queue — ${new Date().toISOString().slice(0, 10)}\n\n` +
      `Filling is done by you, or by an assistant session on your own PC. This repo's job is finding the\n` +
      `opportunities, writing the tailored CV, and handing over a brief per application.\n\n` +
      `Open a Cowork session, paste the \`COWORK.md\` for one row, let it drive the browser, read what\n` +
      `it reports, and press submit yourself.\n\n` +
      (pri.length ? `## Do these first — you picked them\n\n${pri.map(line).join("\n\n")}\n\n` : "") +
      (upgrades.length
        ? `## Beats ${offer ? offer.employer : "your bar"} (${upgrades.length}) — confirmed internships that are an upgrade\n\n` +
          `${offer ? `You already hold ${barLabel(profile)}${intakeLabel(profile) ? ` for ${intakeLabel(profile)}` : ""}, so these are the ones worth an evening` : "These are the ones worth an evening"}: a confirmed\n` +
          `internship at a stronger firm for a technical career, in your home city, or both. Each brief\n` +
          `carries the reasoning under "Against ${barLabel(profile)}".\n\n${upgrades.map(line).join("\n\n")}\n\n`
        : "") +
      `## Applicable, but not an upgrade (${rest.length}), soonest deadline first\n\n` +
      `You can apply to these; on your own stated bar they are sideways moves, or the posting never\n` +
      `confirms it is an internship. Shown so the bar can be caught being wrong.\n\n${rest.slice(0, 40).map(line).join("\n\n")}\n`,
  );

  console.log(`wrote ${n} COWORK.md brief(s) and COWORK-QUEUE.md (${pri.length} priority, ${rest.length} other)`);
}

if (process.argv[1] && process.argv[1].endsWith("cowork-brief.mjs")) main();
