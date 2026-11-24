#!/usr/bin/env node
/**
 * ANSWERS — the whole application form, written out, for every opportunity on the board.
 *
 * A graduate application form is three different things wearing one coat, and they need three
 * different treatments:
 *
 *   A. FIELDS        Name, email, degree, graduation date, right to work. Identical on every form and
 *                    pure lookup. These come straight from the profile with no judgement at all, and
 *                    the win is simply not having to find them again at 11pm.
 *   B. SCREENERS     "Do you require sponsorship?" "Are you eligible to work here?" Yes/No boxes
 *                    that silently reject you if answered carelessly. Recommended answer plus the
 *                    reason, so a wrong one is a decision rather than an accident.
 *   C. FREE TEXT     "Why us", "hardest technical challenge", "tell us about a time". These are the
 *                    ones that take an hour each. Drafted per posting, from the profile, quoting the
 *                    posting's own words back so the answer is specific rather than enthusiastic.
 *
 * Plus D: anything hand-written for that specific employer (`answers/<company>.md`) is appended, so
 * an employer's supplementary questions live alongside the generic pack rather than replacing it.
 *
 * WHAT THIS DOES NOT DO. It does not invent. Every claim in a paste block is a string that already
 * exists in your profile, and `ground-check.mjs` fails the build otherwise. Where a form wants
 * something the profile does not hold, the sheet says so — or leaves a [BRACKETED SLOT] for you —
 * rather than filling it in. Sensitive identifiers (National Insurance number, passport number, date
 * of birth) are deliberately NOT stored or emitted here: a file full of them sitting in a dozen
 * output folders is a liability, not a convenience.
 */

import { bestAchievements, hasTerm, isTechnical, matchSkills, period, rank, wantedFor } from "./select.mjs";
import { graduationYear, inRange, intake, intakeLabel, normalCvPaths, offerToBeat, targetCountries } from "./profile.mjs";

/**
 * The sentence in the posting that names the most things you can actually evidence.
 *
 * Quoting the employer back to themselves is the cheapest way to make a "why us" answer specific, and
 * it is honest by construction: it is their sentence, not a claim about you. A generated answer that
 * says "I am passionate about your mission" is worse than no answer, because it tells the reader the
 * applicant did not read the posting.
 */
export function hookSentence(description, wanted) {
  const sentences = String(description || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 50 && s.length < 320 && !/^(please note|if you (want|suspect)|[\w&.'-]+ values\b|we value|we are committed)/i.test(s));
  let best = null;
  let bestScore = 0;
  for (const s of sentences) {
    const n = wanted.filter((w) => hasTerm(s, w)).length + (/\b(build|building|engineer|infrastructure|platform|system|scale|deploy|research)\b/i.test(s) ? 1 : 0);
    if (n > bestScore) {
      bestScore = n;
      best = s;
    }
  }
  return bestScore > 0 ? best : sentences[0] || null;
}

const gapNote = (what) => `**NOT IN YOUR PROFILE — ${what}.** Add it to \`profile/master-profile.json\` once and it is filled in on every form after this one.`;

/**
 * Has this referee ACTUALLY been asked?
 *
 * `r.consent` is prose, and testing it for truthiness is wrong: `consent: "NOT RECORDED — not asked
 * yet"` is a truthy string. A field that records a negative as a non-empty string cannot be checked
 * for existence; it has to be read. Consent counts only when it starts with "given".
 */
export const hasConsent = (r) => /^\s*given\b/i.test(String(r?.consent || ""));

/** Every field a mandatory-referee form asks for, present. Anything less cannot be submitted. */
export const refereeComplete = (r) =>
  Boolean(r?.name && r?.email && r?.phone && r?.position && !/^TODO/i.test(r.position) && hasConsent(r));

/** "a", "a and b", "a, b and c" — three names joined by "and" twice reads as a bug, because it is one. */
export const andList = (xs) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * Referees that belong on THIS kind of application. An academic referee is the wrong person to vouch
 * for shift work, and a shift manager is the wrong person to vouch for an engineering internship, so
 * each referee carries a scope (technical, non_technical or both).
 */
export const refereesFor = (profile, variant = "technical") =>
  (profile.referees?.items || []).filter((r) => {
    const s = r.scope || "both";
    return s === "both" || s === variant;
  });

/** "the University of X" in prose; a CV stores it without the article. */
export const atInstitution = (name) => (/^(university|college|institute) of\b/i.test(String(name || "")) ? `the ${name}` : String(name || ""));

/** Where you stand at the intake, from graduation year vs intake year — never a hard-coded year. */
function stageNote(profile) {
  const grad = graduationYear(profile);
  const { year } = intake(profile);
  if (grad && year && grad - year === 1) return ", so this would be the summer before my final year";
  if (grad) return `, graduating in ${grad}`;
  return "";
}

function fieldsTable(profile) {
  const id = profile.identity || {};
  const links = id.links || {};
  const uni = profile.education?.[0] || {};
  const school = profile.education?.[1];
  const a = id.address;
  return `| Field | What to enter |
|---|---|
| Full name | ${id.name || "—"} |
| Email | ${id.email || "—"} |
| Phone | ${id.phone || "—"} |
| Address | ${a ? [a.line1, a.city, a.postcode].filter(Boolean).join(", ") : "—"} |
| Postcode | ${a?.postcode || "—"} |
| Country | ${a?.country || "—"} |
| Location | ${id.location || "—"} |
| LinkedIn | ${links.linkedin || "—"} |
| GitHub | ${links.github || "—"} |
| Portfolio / website | ${links.portfolio || "—"} |
| University | ${uni.institution || "—"} |
| Degree | ${uni.qualification || "—"} |
| Subject | ${uni.subject || "—"} |
| Course dates | ${period(uni.start, uni.end) || "—"} |
| Expected grade | ${uni.grade || "—"} |
| Expected graduation | ${period(uni.end, uni.end) || "—"} |
| Year of study at application | ${uni.year_of_study || "—"} |
| Secondary school | ${school ? school.institution : "—"} |
| School results | ${school ? school.grade : "—"} |
| Work authorisation | ${id.work_authorisation || "—"} |`;
}

/** Can you work where this posting is? From target.countries / target.locations, never assumed. */
function authFor(profile, item) {
  const listed = targetCountries(profile).length > 0;
  const here = item?.location ? inRange(item.location, profile) : listed;
  return { listed, here };
}

function screeners(profile, item) {
  const id = profile.identity || {};
  const refs = refereesFor(profile, "technical");
  const { listed, here } = authFor(profile, item);
  const uni = profile.education?.[0] || {};
  const log = profile.logistics || {};
  const offer = offerToBeat(profile);
  const rows = [
    ["Are you eligible to work in the country of this role?", here ? "**Yes**" : "Check", here ? id.work_authorisation || "Your profile lists this country." : listed ? "This role is outside the countries in your profile — confirm before you answer." : "Add target.countries to your profile."],
    ["Do you now or will you in the future require visa sponsorship?", here ? "**No**" : "Check", "Answering this one wrong is the most common silent rejection on a graduate form."],
    ["Have you previously been employed by this organisation?", "**No**", "Unless you have — check before you tick."],
    ["Are you currently a student?", "**Yes**", `${uni.qualification || "Your degree"}, graduating ${period(uni.end, uni.end) || "(add education[0].end)"}.`],
    ["Notice period", `**${log.notice_period || "None — student"}**`, "You are not leaving an employer."],
    ["Earliest start date", `**${profile.target?.timing?.earliest_start || intakeLabel(profile) || "Check"}**`, offer?.note ? `Check it against the offer you hold: ${offer.note}` : "Check this against anything already committed."],
    ["How did you hear about us?", "**Company careers page**", "True — this was found on their own job board feed. Do not guess at a referral you do not have."],
    ["Do you have a criminal conviction / need a DBS or security check?", "Answer honestly", "Some defence and government roles require security clearance, which usually depends on nationality and residence."],
    ["Gender / ethnicity / disability monitoring", "Your choice", "Always optional, always separated from the hiring decision. Declining is not held against you."],
    [
      "References",
      "**Available on request**",
      refs.length
        ? `On file and ${refs.every(hasConsent) ? "already agreed" : "NOT all asked yet — ask before listing"}: ${refs
            .map((r) => `${r.name} (${r.relationship})`)
            .join("; ")}. Contact details in section E.`
        : "No referees on file yet.",
    ],
  ];
  if ((item.kind || "job") !== "job")
    rows.push(["Team status / are you applying solo?", "Answer honestly", "Most hackathons will place you in a team if you have none."]);
  return `| Question | Answer | Why |\n|---|---|---|\n${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join("\n")}`;
}

/**
 * A CV bullet is not a sentence. "Built a pipeline that…" has no subject, because on a CV the subject
 * is the person whose name is at the top. Dropped into a paragraph it reads as something pasted
 * rather than written, so the claim gets its subject back before it goes into prose. Nothing else
 * about it changes — the words after the verb are the profile's, untouched.
 */
export function firstPerson(claim) {
  const c = String(claim).trim();
  if (/^Runner-up\b/i.test(c)) return "I was r" + c.slice(1);
  const first = c.split(/\s/)[0];
  if (/ing$/i.test(first)) return "I am " + c[0].toLowerCase() + c.slice(1);
  return "I " + c[0].toLowerCase() + c.slice(1);
}

/** Two claims, framed. Not five claims in a row, which is a list wearing a paragraph's clothes. */
function fitParagraph(profile, item, wanted, lead = "Two things in my background point at this") {
  const top = rank([...(profile.experience || []), ...(profile.projects || [])], wanted).slice(0, 2);
  const lines = top
    .map((e) => bestAchievements(e, wanted, 1)[0]?.claim)
    .filter(Boolean)
    .map((l) => firstPerson(l).replace(/\.$/, "") + ".");
  if (!lines.length) return "";
  if (lines.length === 1) return `${lead.replace("Two things", "One thing").replace(" point ", " points ")}. ${lines[0]}`;
  return `${lead}. ${lines.join(" ")}`;
}

/**
 * The free-text answers as DATA, not as a document.
 *
 * Two things need the identical words: the markdown sheet a human reads, and apply.mjs, which types
 * them into the real form in a real browser. If those ever diverged, the answer reviewed on screen
 * would not be the answer submitted.
 *
 * A value of null means "the profile cannot answer this" — the sheet shows a slot for you to fill,
 * and apply.mjs leaves that box for you rather than typing a placeholder into a real form.
 */
export function answerBlocks(profile, item) {
  const id = profile.identity || {};
  const wanted = wantedFor(profile, item);
  const { have, missing } = matchSkills(profile, item.description);
  const hook = hookSentence(item.description, wanted);
  const isEvent = (item.kind || "job") !== "job";
  const uni = profile.education?.[0] || {};
  const at = atInstitution(uni.institution);
  const studying = uni.qualification && uni.institution ? `I am studying ${uni.qualification} at ${at}` : "";

  // Only technical matches are worth naming back at an employer. "You asked for communication" is
  // not a match, it is a sentence every applicant could write.
  const technicalHave = have.filter(isTechnical);
  const matched = technicalHave.slice(0, 5).join(", ");

  const whyUs = isEvent
    ? `I want to spend the time building something rather than reading about it. ${fitParagraph(profile, item, wanted, "Two things in my background point the same way")}${studying ? ` ${studying}.` : ""}`
    : `${hook ? `The line in the posting I keep coming back to is this one: "${hook.replace(/[.\s]+$/, "")}." That is the part I want to work on.` : `I want to work on ${item.title.replace(/,.*$/, "")} at ${item.company}.`}

${fitParagraph(profile, item, wanted, "Two things in my background point the same way")}

What I want from an internship is work at a scale I cannot reach alone${technicalHave.length ? `, and specifically the parts that touch ${matched}` : ""}.${studying ? ` ${studying}${stageNote(profile)}.` : ""}`;

  const teamwork = (() => {
    const lead = rank(profile.leadership || [], wanted);
    const claims = lead.map((l) => bestAchievements(l, wanted, 1)[0]?.claim).filter(Boolean);
    return claims.length ? claims.map((c) => firstPerson(c).replace(/\.$/, "") + ".").join(" ") : null;
  })();

  const learning = `What I want to learn is what a system looks like once it has real users and someone is on call for it, which coursework and personal projects do not teach.${
    missing.length
      ? ` Concretely, this posting asks for ${missing.join(" and ")}, which I have not used. I would rather say that now and learn ${missing.length === 1 ? "it" : "them"} properly than imply otherwise.`
      : ""
  }`;

  const whyYou = [
    studying ? `${studying}.${uni.grade ? ` ${uni.grade}.` : ""}` : "",
    fitParagraph(profile, item, wanted, "Two things in my background point at this role"),
    id.work_authorisation ? `${String(id.work_authorisation).replace(/\.$/, "")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Your own words from the profile, or nothing. A story is the one answer that cannot be assembled
  // from CV bullets without inventing the part that matters — what went wrong and how you found out.
  const hardest = String(profile.stories?.hardest_challenge || "").trim() || null;

  return { whyUs, whyYou, hardest, teamwork, learning, isEvent, technicalHave, missing };
}

// ---------------------------------------------------------------------------
// THE NON-TECHNICAL SHEET
//
// A hospitality or events agency is not a graduate scheme wearing different words, and pointing the
// generator above at one produces an answer about pipeline latency for a question about a Saturday
// shift. So this is a separate function rather than a flag: different source
// (experience_non_technical), different screeners (right to work, background check, availability,
// own transport), different questions entirely. It shares fieldsTable() because the fields genuinely
// are the same on every form.
//
// The grounding rule is unchanged and unweakened. Every claim inside a ```paste block below is a
// string that already exists in your profile; where the profile has nothing, the block holds a
// [BRACKETED SLOT] for you to fill, which ground-check strips and counts out loud.

/** Every non-technical claim, in profile order, as first-person prose. */
const nonTechClaims = (profile) =>
  (profile.experience_non_technical?.items || []).flatMap((e) =>
    (e.achievements || []).map((a) => ({ text: firstPerson(a.claim).replace(/\.$/, "") + ".", skills: (a.skills || []).join(" ") })),
  );

function normalScreeners(profile, item) {
  const id = profile.identity || {};
  const { listed, here } = authFor(profile, item);
  const log = profile.logistics || {};
  const uni = profile.education?.[0] || {};
  const pair = (v, missingWhy) => (v ? [`**${v.answer}**`, v.detail || ""] : ["NOT IN YOUR PROFILE", missingWhy]);
  // Date of birth is NOT among these and never will be: a repo that holds a home address, a phone
  // number and a date of birth is an identity kit rather than a job-application folder.
  const transport = pair(log.own_transport, "Answer it yourself. It changes which shifts you get offered, so do not leave it blank.");
  const over18 = log.over_18 ? [`**${log.over_18.answer}**`, log.over_18.detail || ""] : ["Check", "Your date of birth is deliberately not stored here. Tick it yourself."];
  const dbs = pair(log.background_check, "Add logistics.background_check to your profile. Have any certificate to hand; agencies ask for the number.");
  const lic = pair(log.licences, "Add logistics.licences to your profile.");
  const refs = refereesFor(profile, "non_technical");
  const complete = refs.filter(refereeComplete).length;
  const rows = [
    ["Are you eligible to work in the country of this role?", here ? "**Yes**" : "Check", here ? id.work_authorisation || "" : listed ? "Outside the countries in your profile — confirm first." : "Add target.countries to your profile."],
    ["Do you require sponsorship?", here ? "**No**" : "Check", "The one that rejects you silently if ticked wrong."],
    ["Are you over 18?", over18[0], over18[1]],
    ["Are you a student?", "**Yes**", `${uni.qualification || "Your degree"} at ${atInstitution(uni.institution) || "your university"}, ${period(uni.start, uni.end)}. Agencies count this as a positive — students are the flexible-hours pool.`],
    ["Do you hold a current DBS / PVG or similar check?", dbs[0], dbs[1]],
    ["Do you have your own transport?", transport[0], transport[1]],
    ["Do you have a personal licence / SIA badge?", lic[0], lic[1]],
    ["Availability", log.availability ? `**${log.availability}**` : "NOT IN YOUR PROFILE", "Say what is true. An agency that books you for a shift you cannot make stops calling."],
    ["Notice period", `**${log.notice_period || "None"}**`, "Nothing to serve out for agency or zero-hours work."],
    ["Right to work documents", log.right_to_work_document ? `**${log.right_to_work_document}**` : "NOT IN YOUR PROFILE", "Take the physical document to registration; most agencies check it in person."],
    [
      "References",
      complete >= 2 ? "**Yes — two complete**" : `**Not yet — ${complete} of 2 complete, see section E**`,
      `${andList(refs.map((r) => r.name)) || "None on file"} — the right referees for this kind of work, not the academic ones.`,
    ],
  ];
  return `| Question | Answer | Why |\n|---|---|---|\n${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join("\n")}`;
}

export function normalSheet(profile, item, { companySheet = null } = {}) {
  const uni = profile.education?.[0] || {};
  const log = profile.logistics || {};
  const claims = nonTechClaims(profile);
  const lines = claims.map((c) => c.text);
  const leadClaims = [
    ...claims.filter((c) => /lead|supervis|train|manag|mentor/i.test(`${c.text} ${c.skills}`)).map((c) => c.text),
    ...(profile.leadership || []).flatMap((l) => (l.achievements || []).map((a) => firstPerson(a.claim).replace(/\.$/, "") + ".")),
  ].slice(0, 3);
  const slot = (s) => `[${s.toUpperCase()}]`;
  const at = atInstitution(uni.institution);
  const { pdf } = normalCvPaths(profile);
  const fileName = pdf.split(/[\\/]/).pop();

  const about = `I am a student at ${at || "my university"}, and I work alongside my degree rather than instead of it. ${lines.slice(0, 2).join(" ") || slot("two things you have done in shift work")}`;
  const customerService = lines.slice(0, 2).join(" ") || slot("a time you looked after a customer well");
  const pressure = lines[0] || slot("a busy shift and how you kept up");
  const leading = leadClaims.join(" ") || slot("a time you trained or led someone");
  const availability = log.availability ? `${log.availability}.`.replace(/\.\.$/, ".") : slot("your real availability");
  const physical = log.physical_work ? `${firstPerson(log.physical_work).replace(/\.$/, "")}.` : slot("physical or outdoor work you have done");

  return `# ${item.company} — ${item.title}

**Apply:** ${item.url}

**This pack uses your NON-TECHNICAL CV** (\`${fileName}\`, attached in this folder) — not the tailored
technical one. An agency staffing hospitality and events is reading for tills, shifts and reliability,
and a systems-research CV reads as someone who will leave in three weeks.

**Everything inside a \`\`\`paste block goes in the form verbatim.** Everything outside one is notes
for you. Only the paste blocks are grounding-checked — every claim in one traces to your profile
(\`experience_non_technical\`, \`leadership\`, \`logistics\`), and the build fails otherwise.

---

## A. The fields every form asks for

${fieldsTable(profile)}

**Deliberately not stored anywhere in this repo:** National Insurance number, passport number, date of
birth. An agency WILL ask for the NI number at registration — that is normal and correct for payroll,
and it is still not going in a git repository. Take it from your own records on the day.

---

## B. The screening questions

${normalScreeners(profile, item)}

---

## C. The questions this kind of form actually asks

### Tell us about yourself / personal statement

\`\`\`paste
${about}
\`\`\`

### Give an example of good customer service you have delivered

\`\`\`paste
${customerService}
\`\`\`

### Tell us about a time you worked under pressure

\`\`\`paste
${pressure}
\`\`\`

### Have you led a team? Tell us about it

\`\`\`paste
${leading}
\`\`\`

### What is your availability?

\`\`\`paste
${availability}
\`\`\`

### Are you comfortable with physical / outdoor work?

\`\`\`paste
${physical}
\`\`\`

---

## D. Before you send it

1. **Attach \`${fileName}\` from this folder** — not the technical CV. Check the filename before you
   upload; that is the single easiest thing to get wrong here.
2. Anything marked **NOT IN YOUR PROFILE** above, and any [BRACKETED SLOT] in a paste block, is
   yours to answer. Add it to the profile once and it is filled in on every sheet after this one.
3. Agencies register you once and then call you for years. Whatever availability you give becomes the
   shifts you are offered, so give the real one.

---

## E. Referees${(() => {
    const refs = refereesFor(profile, "non_technical");
    if (!refs.length) return " — none on file for this kind of work";
    const ready = refs.filter(refereeComplete).length;
    // The form wants TWO complete referees, not every referee complete.
    return ready >= 2 ? ` — ready (${ready} complete)` : ` — **${ready} of the 2 needed are complete**`;
  })()}

Agency forms usually want more than a name and an email: **name, position, company, email AND phone
number, for two referees, all mandatory** — so this table is laid out as the form asks for it rather
than as a CV would list it. **You need two rows with no gaps in them.**

${(() => {
    const refs = refereesFor(profile, "non_technical");
    if (!refs.length) return "None on file for this kind of work.";
    const cell = (v, missing) => (v ? String(v) : `**${missing}**`);
    return (
      `| Name | Position | Company | Email | Phone | Asked? |\n|---|---|---|---|---|---|\n` +
      refs
        .map(
          (r) =>
            `| ${r.name} | ${/^TODO/i.test(r.position || "") ? "**you confirm**" : cell(r.position, "you confirm")} | ${cell(
              r.organisation,
              "you confirm",
            )} | ${cell(r.email, "missing")} | ${cell(r.phone, "MISSING — form will not submit")} | ${
              hasConsent(r) ? "yes" : "**NOT YET — ask first**"
            } |`,
        )
        .join("\n")
    );
  })()}

${(() => {
    const refs = refereesFor(profile, "non_technical");
    const complete = refs.filter(refereeComplete);
    if (!refs.length) return "";
    if (complete.length >= 2)
      return `**Ready.** ${andList(complete.slice(0, 2).map((r) => r.name))} are complete and have agreed — use those two.`;
    const lines = refs.map((r) => {
      const missing = [];
      if (!r.phone) missing.push("phone number");
      if (!r.position || /^TODO/i.test(r.position)) missing.push("exact job title");
      if (!hasConsent(r)) missing.push("their agreement — ask before you list them");
      return missing.length ? `- **${r.name}** — still needs ${andList(missing)}.` : `- **${r.name}** — complete.`;
    });
    return `**${complete.length} of the 2 you need are complete.** Per person:\n\n${lines.join("\n")}\n\nAn agency ringing a referee who was not warned is worse than no reference at all, so the asking is not a formality — it is the first item.`;
  })()}

${(() => {
    const excluded = (profile.referees?.items || []).filter((r) => r.scope === "technical");
    return excluded.length
      ? `Deliberately left out of this table: ${andList(excluded.map((r) => r.name))} — ${excluded.length === 1 ? "a technical referee" : "technical referees"}, and the wrong fit for agency work. ${excluded.length === 1 ? "It appears" : "They appear"} on the technical packs instead.`
      : "";
  })()}
${companySheet ? "\n---\n\n" + companySheet : ""}`;
}

export function answerSheet(profile, item, { companySheet = null } = {}) {
  const id = profile.identity || {};
  const { whyUs, whyYou, hardest, teamwork, learning, isEvent, technicalHave, missing } = answerBlocks(profile, item);
  const gaps = profile.gaps_known?.items || [];
  const strengths = gaps.length ? gaps.map((g) => `- ${g}`).join("\n") : "- None in your profile (gaps_known). Add the honest ones.";
  const refs = refereesFor(profile, "technical");

  return `# ${item.company} — ${item.title}

**Apply:** ${item.url}

Generated for this specific posting. **Everything inside a \`\`\`paste block goes in the form verbatim.**
Everything outside one is notes for you. Only the paste blocks are grounding-checked, because only
they get sent — every claim in one traces to \`profile/master-profile.json\`, and the build fails
otherwise.

---

## A. The fields every form asks for

${fieldsTable(profile)}

${id.address ? "" : gapNote("full postal address") + "\n"}**Deliberately not stored anywhere in this repo:** National Insurance number, passport number, date of
birth. Forms ask for these at offer stage. A dozen output folders each holding a copy of them would
be a liability, not a convenience.

---

## B. The screening questions

These are the yes/no boxes that reject you quietly. The recommended answer and the reason are both
given, so a wrong one is a decision rather than an accident.

${screeners(profile, item)}

---

## C. The free-text questions

${
  technicalHave.length
    ? `**What this posting explicitly asks for that you have:** ${technicalHave.join(", ")}.`
    : `**This posting names no specific technology your profile claims.** The drafts below lead with your strongest entries instead.`
}${missing.length ? `\n\n**What it asks for that you do not have:** ${missing.join(", ")}. Named honestly in the "what do you want to learn" answer below — do not imply otherwise anywhere else.` : ""}

### Why this ${isEvent ? "event" : "role / why us"}

\`\`\`paste
${whyUs}
\`\`\`

### Why you — what makes you a good fit

\`\`\`paste
${whyYou}
\`\`\`

### Hardest technical challenge

\`\`\`paste
${hardest || "[WRITE YOUR HARDEST TECHNICAL CHALLENGE HERE]"}
\`\`\`

${
  hardest
    ? "*Taken verbatim from `stories.hardest_challenge` in your profile.*"
    : "*Your profile has no `stories.hardest_challenge`. Write it once there, in your own words — what went wrong, how you found out, what fixed it — and it appears here and in every form after this one.*"
}

### Tell us about working in a team / leading something

\`\`\`paste
${teamwork || "[A TIME YOU WORKED IN OR LED A TEAM]"}
\`\`\`

### What do you want to get out of this ${isEvent ? "event" : "internship"}?

\`\`\`paste
${learning}
\`\`\`

### Greatest weakness / what are you working on

Your standing gaps, from the profile. Pick one and say it plainly — a rehearsed non-weakness
("I care too much") is the answer everyone gives and nobody believes:

${strengths}

---

## E. Referees — ${refs.length ? (refs.every(hasConsent) ? "all have already agreed" : "ask them first") : "none on file"}

${
  refs.length
    ? `| Name | Email | Covers | Asked? |\n|---|---|---|---|\n${refs
        .map((r) => `| ${r.name} | ${r.email} | ${r.relationship || r.covers || ""} | ${hasConsent(r) ? "yes" : "**NOT YET — ask first**"} |`)
        .join("\n")}`
    : "None on file."
}

Deliberately outside every paste block: a referee's email is not something to hand over with a
speculative application. It goes in when the form asks for it — which is the point at which someone
may actually call them.

---

## D. Before you paste

1. Any [BRACKETED SLOT] in a paste block is yours to write. Everything else on this sheet traces to
   your profile.
2. Answers here are drafted, not polished for this employer's voice. Read them once. If a sentence is
   not something you would say out loud, change it.
3. Attach **the tailored CV in this folder** — it is ordered against this posting specifically.
${companySheet ? "\n---\n\n" + companySheet : ""}`;
}
