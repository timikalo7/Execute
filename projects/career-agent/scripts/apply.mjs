#!/usr/bin/env node
/**
 * APPLY — opens the real application form on YOUR machine, fills it, and stops.
 *
 * The browser has to run where your network and your logins already are, which is your own computer.
 * That is not a workaround. It is the correct place for it: your session, your machine, your hand on
 * the submit button. (A cloud container often has no browser egress at all — Playwright there gets
 * ERR_CONNECTION_RESET on every employer host while curl to the same host succeeds.)
 *
 * THE ONE RULE: THIS SCRIPT NEVER SUBMITS.
 *
 * It fills, it reports what it filled, and it leaves the browser open. Every control whose text looks
 * like submit/apply/send/confirm is refused, there is no code path that presses one, and
 * `--self-test` proves that refusal fires rather than assuming it. An application cannot be
 * unsubmitted; a filled form you have not read is not a time-saving, it is a mistake with your name
 * on it.
 *
 * Two more deliberate refusals:
 *   - password fields are never typed into, and no credential is read, stored or transmitted. Log in
 *     yourself once; the persistent browser profile remembers it.
 *   - nothing is invented. Every value comes from your profile or from the generated answers, both of
 *     which the grounding check already guards. A question the profile cannot answer is left for you.
 *
 *   npm run apply -- --list                     what is on the board
 *   npm run apply -- <slug>                     fill one application (headed browser)
 *   npm run apply -- <slug> --url <url>         override the target (a company careers page)
 *   npm run apply -- --all=8 [--attach=9222]    fill a batch, one tab each
 *   npm run apply -- --self-test                prove the matching and the never-submit rule
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { chromium } from "playwright";
import { answerBlocks } from "./answers.mjs";
import { loadFound, pdfNameFor, slugFor } from "./tailor.mjs";
import { cdpPort, chromiumOptions, exitIfNoBrowser, graduationYear, inRange, launchBrowser, loadExample, loadProfile, NO_BROWSER_HELP, PROJECT_ROOT, readJson, targetCountries, testPort } from "./profile.mjs";

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, ".browser-profile");

/** Anything that could send the form. Matched against text, value, name, id and aria-label. */
const SUBMIT_LIKE = /\b(submit|send|apply now|apply for|finish|complete application|confirm and|continue to review)\b/i;

/**
 * Field rules, most specific first — the first match wins.
 *
 * Order is load-bearing. "First name" has to be tested before "name", or every first-name box gets
 * the full name. Each rule matches against everything visible about the control: its label, name,
 * id, placeholder and aria-label, joined and lowercased. A value of null means "deliberately left
 * blank — nothing truthful to put here".
 */
export function rules(profile, item, docs) {
  const id = profile.identity || {};
  const links = id.links || {};
  const a = id.address || {};
  const edu = profile.education || [];
  const uni = edu[0] || {};
  // The pre-university entry, for forms that ask about school separately from university.
  const school = edu.find((e) => /school|college|academy|sixth\s*form/i.test(e.institution || "") && e !== uni);
  const [first, ...rest] = String(id.name || "").split(/\s+/);
  const last = rest.join(" ");
  const gradYear = graduationYear(profile) ? String(graduationYear(profile)) : null;
  const gradMonth = (uni.end || "").slice(5, 7);
  // Work authorisation is ANSWERED only when the posting is somewhere your profile says you can work
  // (target.countries / target.locations). Anywhere else, the box is left for you.
  const authorised = targetCountries(profile).length > 0 && (!item?.location || inRange(item.location, profile));
  const log = profile.logistics || {};

  return [
    // YOUR DECLARED ANSWERS FIRST, always.
    //
    // The generic rules below know what a "First name" box is. They cannot know that one agency asks
    // "How many years bar experience do you have?" as a slider and that your true answer is zero —
    // that is a fact about ONE employer's form and one person's history. So a row in jobs/manual.json
    // can carry `form_answers`: [pattern, value] pairs, matched before anything else. A value of null
    // still means "deliberately blank".
    ...(item?.form_answers || []).map(([re, v]) => [new RegExp(re, "i"), v]),
    [/first\s*name|given\s*name|forename|^fname/, first || null],
    [/last\s*name|sur\s*name|family\s*name|^lname/, last || null],
    [/preferred\s*name|nick\s*name/, first || null],
    [/full\s*name|^name$|your\s*name|applicant\s*name|legal\s*name/, id.name || null],
    [/e-?mail/, id.email || null],
    [/phone|mobile|telephone|contact\s*number/, id.phone || null],
    // SCREENERS COME BEFORE THE ADDRESS RULES, and that order is load-bearing. Measured on a real
    // Lever form: "Are you legally authorized to work in the country for which you are applying?" was
    // matched by /\bcountry\b/ and answered with a country name, which is neither Yes nor No, so the
    // most important question on the form was silently left blank. The specific question is always
    // tested first.
    [/\bsponsor(ship|ed|)\b/, authorised ? "No" : null],
    [/(authoriz|authoris)ed\s*to\s*work|right\s*to\s*work|eligible\s*to\s*work|legally\s*(able|entitled)/, authorised ? "Yes" : null],
    [/previously\s*(been\s*)?(employed|worked|applied)|former\s*employee/, "No"],
    [/are\s*you\s*(currently\s*)?a\s*student/, "Yes"],
    // WORD BOUNDARIES ON EVERY SHORT TERM. Without them, /unit/ matched "United Kingdom" and the
    // work-authorisation question was classified as "address line 2" and left blank. A term short
    // enough to live inside another word gets \b.
    [/address\s*line\s*2|\bapartment\b|\bsuite\b|\bunit\b/, null], // nothing truthful to put here
    [/address\s*line\s*1|street|^address$|address1|home\s*address/, a.line1 || null],
    [/(post|zip)\s*co?de|postal/, a.postcode || null],
    [/^city$|\btown\b|\bcity\b/, a.city || null],
    [/\bcountry\b|\bnationality\b/, a.country || null],
    [/\bcounty\b|\bstate\b|\bprovince\b|\bregion\b/, null],
    [/linked\s*in/, links.linkedin || null],
    [/git\s*hub/, links.github || null],
    [/portfolio|personal\s*(web)?site|^website|^url$|other\s*website/, links.portfolio || null],
    // HIGH SCHOOL BEFORE UNIVERSITY, ALWAYS. A real form asks "High School Name" and "Year of High
    // School Graduation", and /school/ in the university rule answered both with the university — a
    // false answer on a required field, written confidently.
    [/high\s*school\s*name|secondary\s*school/, school ? school.institution : null],
    [/(year|date)\s*of\s*high\s*school|high\s*school\s*grad/, school ? (school.end || "").slice(0, 4) || null : null],
    // Graduation year before degree: "intended graduation year for your degree" contains "degree",
    // and answering it with the degree title is not a year. When the form says what shape it wants,
    // give it that shape — "Graduation Date (MM/YYYY)" is not answered by a bare year.
    [/grad(uation)?\s*date\s*\(mm\s*\/\s*yyyy\)|grad[^|]*mm\s*\/\s*yyyy/, gradYear && gradMonth ? `${gradMonth}/${gradYear}` : null],
    [/grad(uation)?\s*(date|year|month)|year\s*of\s*grad|expected\s*grad|end\s*date|completion/, gradYear],
    [/school|university|institution|college|education/, uni.institution || null],
    [/degree|qualification/, uni.qualification || null],
    [/discipline|\bmajor\b|field\s*of\s*study|\bsubject\b|\bcourse\b/, uni.subject || uni.qualification || null],
    [/\bgpa\b|\bgrade\b|classification|\bresult\b/, uni.grade || null],
    [/notice\s*period/, log.notice_period || "None — student"],
    [/how\s*did\s*you\s*hear|referral\s*source|^source$/, "Company careers page"],
    // "Current location" is often REQUIRED, and there is a truthful answer to it in the profile.
    [/current\s*location|where\s*are\s*you\s*(currently\s*)?based|your\s*location|^location$/, a.city && a.country ? `${a.city}, ${a.country}` : id.location || null],
    [/current\s*(employer|company)|company\s*name|^org$|^organisation$|^organization$/, uni.institution || null],
    // Free text, matched to the generated answers. A null answer (no story in the profile) is left
    // for you rather than typed in as a placeholder.
    [/why\s*(do\s*you\s*want|are\s*you\s*interested|this\s*(role|company|position)|us\b)|motivat|cover\s*letter/, docs.whyUs || null],
    [/hardest|most\s*(challenging|difficult)|technical\s*(challenge|problem)|proudest\s*technical/, docs.hardest || null],
    [/\bteam\b|collaborat|\bleader(ship)?\b|tell\s*us\s*about\s*a\s*time/, docs.teamwork || null],
    [/what\s*(do\s*you\s*)?(want|hope)\s*to\s*(get|learn|gain)|learning\s*goals|develop/, docs.learning || null],
    [/about\s*(yourself|you)|why\s*you|good\s*fit|suitab/, docs.whyYou || null],
  ];
}

/** Everything visible about a control, so a rule can be matched against a human's view of it. */
const DESCRIBE = `(el) => {
  const bits = [];
  if (el.id) {
    const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (l) bits.push(l.innerText);
  }
  const wrap = el.closest('label');
  if (wrap) bits.push(wrap.innerText);
  // The question a control belongs to, found by climbing.
  //
  // Two things went wrong here on a real Lever form, and both are worth keeping in mind:
  //  1. ONE querySelector WITH A COMMA LIST IS NOT A PRIORITY ORDER — it returns the first match in
  //     DOCUMENT order whichever selector matched, so it returned the first option's own <label>
  //     and every checkbox described itself as "English (ENG)".
  //  2. closest() stops at the NEAREST wrapper, which on Lever is an inner .application-field that
  //     contains no question text at all. The title lives on an ancestor two levels further up.
  // So: climb, and at each level try the selectors most-specific-first, one at a time.
  let node = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    if (!node.matches('fieldset, .field, [class*="question"], [class*="field"], li, .form-group')) continue;
    let found = '';
    for (const s of ['legend', '.application-label .text', '[class*="label"] .text', '.label', 'h3', 'h4']) {
      const lg = node.querySelector(s);
      if (lg && lg.innerText.trim()) { found = lg.innerText.trim(); break; }
    }
    if (found) { bits.push(found); break; }
  }
  bits.push(el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '', el.name || '', el.id || '');
  return bits.join(' | ').replace(/\\s+/g, ' ').trim();
}`;

/**
 * A radio or checkbox's OWN label — the text of that one option, not the question above it.
 *
 * This is the difference between ticking "Yes" and ticking "No" on "Are you legally authorized to
 * work here?". Both radios describe themselves with the same question text, so a rule that resolves
 * to "Yes" matched BOTH of them. The option's own label is the only thing that distinguishes them.
 */
const OWN_LABEL = `(el) => {
  if (el.id) {
    const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (l && l.innerText.trim()) return l.innerText.trim();
  }
  const wrap = el.closest('label');
  if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
  const sib = el.nextElementSibling;
  if (sib && sib.innerText && sib.innerText.trim()) return sib.innerText.trim();
  return el.value && el.value !== 'on' ? el.value : '';
}`;

export async function scan(page) {
  return page.evaluate(`(() => {
    const describe = ${DESCRIBE};
    const ownLabel = ${OWN_LABEL};
    const out = [];
    let i = 0;
    // CLEAR THE MARKERS FROM THE PREVIOUS SCAN FIRST. The indices restart at 0 on every scan, so on
    // page 2 of a wizard the elements of page 1 still carried data-cvfill="0", "1", "2"… and the
    // selector matched two elements — one of them hidden — and page 2 silently filled nothing.
    for (const old of document.querySelectorAll('[data-cvfill]')) old.removeAttribute('data-cvfill');
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const type = (el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button' || type === 'image') continue;
      const r = el.getBoundingClientRect();
      if (type !== 'file' && r.width === 0 && r.height === 0) continue;
      el.setAttribute('data-cvfill', String(i));
      out.push({
        idx: i++,
        tag: el.tagName.toLowerCase(),
        type,
        // The control's name, so radio and checkbox options that belong to ONE question can be
        // reported as one question rather than as thirty-five separate unanswered fields.
        name: el.name || '',
        own: (type === 'radio' || type === 'checkbox') ? ownLabel(el) : '',
        text: describe(el),
        required: el.required || el.getAttribute('aria-required') === 'true',
        value: el.value || '',
        options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.text) : undefined,
      });
    }
    return out;
  })()`);
}

/** Pick the option that actually means what we want, rather than the one that merely contains it. */
function bestOption(options, want) {
  const w = String(want).toLowerCase();
  const exact = options.find((o) => o.trim().toLowerCase() === w);
  if (exact) return exact;
  const starts = options.find((o) => o.trim().toLowerCase().startsWith(w));
  if (starts) return starts;
  // "No" must not match "Not applicable", and must not match the "No" inside "I do not require...".
  return options.find((o) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(o)) || null;
}

/**
 * Does this one option mean the answer we want?
 *
 * Exported and deliberately strict. "No" must not match "Not applicable" or the "no" inside "I do
 * not require sponsorship"; "Yes" must not match "Yes, but only if…". Anything it is unsure about is
 * a false, which leaves the choice to the human — the safe direction for a control that cannot be
 * un-ticked once the form is sent.
 */
export function optionMeans(own, want) {
  const o = String(own).trim().toLowerCase().replace(/[*✱]/g, "").trim();
  const w = String(want).trim().toLowerCase();
  if (o === w) return true;
  // "Yes, I consent" / "No, I do not" — a leading Yes/No followed by punctuation still means it.
  if (/^(yes|no)$/.test(w)) return new RegExp(`^${w}\\b[\\s,.:;–—-]*`, "i").test(o) && o.split(/\s+/)[0].replace(/[^a-z]/g, "") === w;
  return false;
}

async function fillOne(page, field, value) {
  const sel = `[data-cvfill="${field.idx}"]`;
  if (field.tag === "select") {
    const opt = bestOption(field.options || [], value);
    if (!opt) return { ok: false, why: `no option matching ${JSON.stringify(value)}` };
    await page.selectOption(sel, { label: opt });
    return { ok: true, wrote: opt };
  }
  if (field.type === "checkbox" || field.type === "radio") {
    // When the option carries its own label, it is the ONLY thing allowed to decide. Both radios of
    // a Yes/No pair describe themselves with the same question, so matching on the question would
    // tick whichever one came first — including "No" to "Are you legally authorized to work here?",
    // which is a silent rejection with your name on it.
    if (field.own) {
      // A CHECKBOX is not a choice between alternatives, it is a single statement you either agree
      // with or do not — "I consent to my data being processed" has no opposite box next to it. So an
      // explicit Yes/true ticks it whatever its label says. A RADIO keeps the strict rule, because
      // there its label IS the answer. (Found on a screenshot: a marketing checkbox whose label
      // started with "Yes, <agency> can contact me…" was ticked, and the data-processing consent
      // beside it was not, because its label is a sentence.)
      if (field.type === "checkbox" && /^(yes|true)$/i.test(String(value))) {
        await page.check(sel);
        return { ok: true, wrote: `ticked: ${field.own.slice(0, 50)}` };
      }
      if (!optionMeans(field.own, value)) return { ok: false, why: "left for you to decide" };
      await page.check(sel);
      return { ok: true, wrote: field.own };
    }
    if (!/^yes$|^true$/i.test(String(value))) return { ok: false, why: "left for you to decide" };
    await page.check(sel);
    return { ok: true, wrote: "checked" };
  }
  // A SLIDER cannot be typed into: Playwright's fill() throws on input[type=range]. Real agency forms
  // ask "How many years of experience do you have?" as REQUIRED range inputs, so a filler that cannot
  // move a slider cannot complete them.
  //
  // Setting .value directly does not notify anything — React and Stimulus controllers listen for
  // events, so the visible number and the posted value would disagree. Hence the explicit
  // input+change dispatch, and hence reading the value back afterwards: a range silently clamps to
  // its own min/max/step, so "0" on a slider that starts at 1 is not a zero.
  if (field.type === "range") {
    const wrote = await page.$eval(
      sel,
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return el.value;
      },
      value,
    );
    if (String(wrote) !== String(value))
      return { ok: false, why: `slider clamped ${JSON.stringify(String(value))} to ${JSON.stringify(wrote)} — set it yourself` };
    return { ok: true, wrote };
  }
  await page.fill(sel, String(value));
  return { ok: true, wrote: String(value) };
}

/** The refusal, as a function, so the self-test can call it directly. */
export function wouldSubmit(text) {
  return SUBMIT_LIKE.test(String(text || ""));
}

/**
 * One multi-choice question, reported once.
 *
 * Measured against a real Lever form: "Language Skill(s) (Check all that apply)" has thirty-five
 * checkboxes, and every one of them arrived in LEFT FOR YOU as its own required field. A report
 * nobody will read is the same as no report — and the whole point of this script is that a human
 * reads it before submitting. Options that share a control name collapse into one line.
 */
export function collapseGroups(rows) {
  const out = [];
  const seen = new Map();
  for (const [label, why, group] of rows) {
    if (!group) {
      out.push([label, why]);
      continue;
    }
    if (!seen.has(group)) {
      const at = out.push([label, why]) - 1;
      seen.set(group, { at, n: 1 });
      continue;
    }
    const g = seen.get(group);
    g.n++;
    out[g.at][1] = `${why} — ${g.n} options, pick from them`;
  }
  return out;
}

async function run() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.includes("--i-will-submit"))
    console.log("apply: --i-will-submit is not supported. This tool never presses submit — you read the form and press it yourself.\n");
  const profile = loadProfile();
  const found = loadFound();
  const items = found.jobs.filter((j) => (j.eligibility?.verdict ?? "check") !== "ineligible");

  if (args.includes("--list") || !args.length) {
    // Priority first, in your own order. A list of a hundred slugs where the few you asked for are
    // scattered through it is a list you have to search.
    const pri = items.filter((j) => j.priority).sort((a, b) => a.priority - b.priority);
    const rest = items.filter((j) => !j.priority);
    if (pri.length) {
      console.log("\nDO THESE FIRST — you picked them:\n");
      for (const j of pri)
        console.log(`  ${String(j.priority).padStart(2)}. ${slugFor(j).padEnd(58)} ${j.company} — ${j.title}${j.deadline ? `\n      ${j.deadline}` : ""}`);
    }
    console.log(`\n${pri.length ? "Everything else" : "On the board"}:\n`);
    for (const j of rest) console.log(`  ${slugFor(j).padEnd(62)} ${j.company} — ${j.title}`);
    console.log(`\nnpm run apply -- <slug>\n`);
    return;
  }

  // --all does a batch in one run: every opportunity that has a CV, each in its own tab, so you
  // review a stack of filled forms in one sitting. Tabs, not sequential pages, because a form you
  // have closed cannot be reviewed.
  const allFlag = args.find((a) => a === "--all" || a.startsWith("--all="));
  const batchCap = allFlag && allFlag.includes("=") ? Number(allFlag.split("=")[1]) : 8;
  const hasCv = (j) => fs.existsSync(path.join(ROOT, "output", slugFor(j), pdfNameFor(j, profile)));

  let queue;
  if (allFlag) {
    queue = items.filter(hasCv).slice(0, batchCap);
    if (!queue.length) {
      console.error("apply: nothing on the board has a CV yet — run `npm run daily` first");
      process.exit(2);
    }
    console.log(`\nBatch: ${queue.length} of ${items.filter(hasCv).length} ready opportunities (cap ${batchCap} — raise it with --all=20).`);
    console.log("Each opens in its own tab and is filled. NOTHING is submitted.\n");
  } else {
    const slug = args.find((a) => !a.startsWith("--"));
    const item = items.find((j) => slugFor(j) === slug);
    if (!item) {
      console.error(`apply: no opportunity with slug ${JSON.stringify(slug)} — run with --list`);
      process.exit(2);
    }
    if (!hasCv(item)) {
      console.error(`apply: no CV for ${slug} — run \`npm run daily\` first`);
      process.exit(2);
    }
    queue = [item];
  }

  const urlFlag = args.indexOf("--url");
  const urlOverride = urlFlag > -1 ? args[urlFlag + 1] : null;

  // Headed by default and deliberately: the human has to SEE the filled form before submitting it.
  // --headless exists so the filler can be exercised against a saved copy of a real employer form on
  // a machine with no display.
  const headless = args.includes("--headless");

  // WHICH browser, and why it matters.
  //
  // "There was an error verifying your application" on a form is a bot check, and Playwright's own
  // bundled Chromium is the easiest build on the internet to spot. Two changes, in order:
  //
  //   1. Drive a REAL installed browser. `channel: "msedge"` uses the Microsoft Edge already on a
  //      Windows machine; on macOS and Linux the default is "chrome". --browser= or
  //      CAREER_AGENT_BROWSER picks another (msedge, chrome, or chromium for Playwright's own build).
  //      (Opera GX is NOT a Playwright channel.)
  //   2. Turn off the switches that announce automation: --disable-blink-features=AutomationControlled,
  //      and drop --enable-automation. With both, `navigator.webdriver` reads false (see the self-test).
  //
  // HONEST LIMIT: one flag is not a guarantee. Commercial bot checks also score TLS fingerprints,
  // timing, mouse movement and IP reputation. If a site still refuses, the answer is NOT a cleverer
  // disguise — it is `answers.md`, which holds every answer as a paste block so the form can be filled
  // by hand in your everyday browser. Nothing here pretends to be a different person.
  const wanted = ((args.find((a) => a.startsWith("--browser=")) || "").split("=")[1] || process.env.CAREER_AGENT_BROWSER || "")
    .trim()
    .toLowerCase();
  // Defaults: Edge on Windows, Chrome elsewhere — except that a CAREER_AGENT_CHROMIUM path, which
  // macOS and Linux used before Chrome became their default, is still used there when it is set.
  const fallbackChannel = process.platform === "win32" ? "msedge" : process.env.CAREER_AGENT_CHROMIUM ? undefined : "chrome";
  const channel = wanted === "chromium" ? undefined : wanted || fallbackChannel;

  const launch = {
    headless,
    channel,
    viewport: headless ? { width: 1280, height: 900 } : null,
    args: ["--disable-blink-features=AutomationControlled", ...(headless ? [] : ["--start-maximized"])],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  // ---- ATTACH: use the browser that is ALREADY RUNNING ------------------------------------------
  //
  // A launched browser starts from a BLANK profile: no history, no extensions, no logins, no cookies
  // older than this minute. That is not what a real person's browser looks like, and fingerprinting
  // scores it. apply.cmd starts Edge with --remote-debugging-port against a persistent profile of your
  // own, and --attach connects to it over CDP. The never-submit rule is untouched, and closing the
  // connection here does NOT close your browser.
  const attachFlag = args.find((a) => a === "--attach" || a.startsWith("--attach="));
  const attachPort = attachFlag?.includes("=") ? Number(attachFlag.split("=")[1]) : 9222;

  // Closing an ATTACHED context would close your own browser, with your tabs in it.
  const done = async () => {
    if (attachFlag) {
      console.log("\nYour browser is still open — it is yours. Read the form, fix anything wrong, and submit it yourself.");
      return;
    }
    await ctx.close();
  };

  let ctx;
  if (attachFlag) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${attachPort}`);
      ctx = browser.contexts()[0] || (await browser.newContext());
      console.log(`browser: ATTACHED to the browser already running on port ${attachPort}.`);
      console.log(`         Your profile, your history, your logins — not a fresh automated instance.`);
    } catch (e) {
      console.error(`\nbrowser: could NOT attach on port ${attachPort} — ${String(e.message).split("\n")[0].slice(0, 90)}`);
      console.error(`         Nothing is listening there, so Edge was not started with remote debugging.`);
      console.error(`         Start it first (apply.cmd does this for you):`);
      console.error(`           msedge.exe --remote-debugging-port=${attachPort} --user-data-dir="%LOCALAPPDATA%\\career-agent-edge"`);
      console.error(`         Refusing to fall back to a fresh automated profile — that is the thing being refused.\n`);
      process.exit(2);
    }
  } else {
    try {
      ctx = await chromium.launchPersistentContext(PROFILE_DIR, channel ? launch : chromiumOptions(launch));
      if (channel) console.log(`browser: ${channel} (a real installed browser, not Playwright's bundled Chromium)`);
      console.log(`         NOTE: this is still a BLANK profile — no history, no logins, no extensions.`);
      console.log(`         If a site refuses you, use apply.cmd, which attaches to your own browser instead.`);
    } catch (e) {
      // A machine without Edge must not be a dead end. Say what happened rather than falling back
      // silently, because the fallback is the build that gets flagged.
      if (!channel) throw e;
      console.log(`browser: could not launch ${channel} (${String(e.message).split("\n")[0].slice(0, 80)})`);
      console.log(`         falling back to Playwright's bundled Chromium, which bot checks flag more often.`);
      const other = channel === "msedge" ? ["Microsoft Edge", "chrome"] : ["Google Chrome", "msedge"];
      console.log(`         Install ${other[0]}, or pass --browser=${other[1]} if you have that browser instead.`);
      ctx = await chromium.launchPersistentContext(PROFILE_DIR, chromiumOptions({ ...launch, channel: undefined })).catch((e2) => {
        if (!/Executable doesn't exist/.test(String(e2.message))) throw e2;
        console.error(`career-agent: no browser could be started (tried ${channel} (installed), bundled chromium). ${NO_BROWSER_HELP}`);
        process.exit(3);
      });
    }
  }

  const summary = [];
  const interactive = !headless && !allFlag;

  for (const [n, item] of queue.entries()) {
    const url = urlOverride || item.url;
    const pdf = path.join(ROOT, "output", slugFor(item), pdfNameFor(item, profile));
    const docs = answerBlocks(profile, item);

    console.log(`\n${"═".repeat(78)}`);
    console.log(`${queue.length > 1 ? `[${n + 1}/${queue.length}] ` : ""}${item.company} — ${item.title}`);
    console.log(url);

    // A fresh tab per opportunity, kept open. The first one reuses the tab the browser opened with.
    const page = n === 0 ? ctx.pages()[0] || (await ctx.newPage()) : await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      console.log(`  could not open — ${String(e.message).split("\n")[0].slice(0, 70)}`);
      summary.push([item, 0, 0, "could not open"]);
      continue;
    }
    const res = await applyOne(page, { item, pdf, docs, profile, interactive, dump: args.includes("--dump"), reconOnly: args.includes("--recon-only") });
    if (res === "dumped") { await done(); return; }
    summary.push([item, res.filledCount, res.leftCount, res.stopReason]);
  }

  if (queue.length > 1) {
    console.log(`\n${"═".repeat(78)}\nBATCH SUMMARY\n`);
    for (const [item, f, l] of summary)
      console.log(`  ${String(f).padStart(3)} filled  ${String(l).padStart(3)} left   ${item.company} — ${item.title.slice(0, 44)}`);
    console.log(`\nEvery tab is open and filled. NOTHING HAS BEEN SUBMITTED.`);
    console.log(`Go through them one at a time, fix what is wrong, and press submit yourself.`);
  }

  if (!headless) await ask("\nPress Enter here when you are done to close the browser... ");
  await done();
}

/**
 * Everything that happens on ONE opportunity's tab: navigate past the posting, then fill each page.
 * It ends on the last page of the form, filled and NOT submitted — there is no branch that presses
 * submit. `outDir` is where form-questions.md goes (output/<slug>/ by default).
 */
export async function applyOne(page, { item, pdf, docs, profile, interactive = false, dump = false, reconOnly = false, outDir = null }) {
  // Lever and Greenhouse often show the posting first and the form behind an "Apply" link. Clicking
  // that is navigation, not submission — but only when no form is on the page yet.
  if (!(await scan(page)).length) {
    const link = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
    if (await link.count()) {
      await link.click().catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }

  // BEFORE ANYTHING IS TYPED: has the page's own script armed the form? A Teamtailor form still
  // carrying its `city` honeypot has not run its controller, and submitting it returns "There was an
  // error verifying your application" no matter how real the browser is. Filling a form that cannot
  // be accepted is worse than not filling it, because it looks like it worked.
  const armed = await formReady(page);
  if (armed.armed) {
    console.log(`form check: armed${armed.waitedMs > 600 ? ` (the site's script took ${armed.waitedMs}ms)` : ""} — the site's own anti-bot fields are cleared.`);
  } else {
    console.log(`\nform check: NOT ARMED after ${Math.round(armed.waitedMs / 1000)}s. Still present:`);
    for (const t of armed.traps) console.log(`  - ${t}`);
    console.log(`  This is what produces "There was an error verifying your application" — the page's own`);
    console.log(`  JavaScript has not finished setting the form up, so the server rejects the post.`);
    console.log(`  Reload the page in the browser, let it settle, and run this again. Filling it now would`);
    console.log(`  look like it worked and fail when you submit.\n`);
  }

  const fields = await scan(page);
  const rs = rules(profile, item, docs);

  // --dump prints exactly what the matcher sees, which is the only way to work out WHY a field was
  // missed. Reading the page and guessing at the label is how the wrong rule gets written.
  if (dump) {
    for (const f of fields) {
      const hit = rs.find(([re]) => re.test(f.text.toLowerCase()));
      console.log(`[${String(f.idx).padStart(3)}] ${f.type.padEnd(9)} req=${f.required ? "Y" : "n"} own=${JSON.stringify(f.own).padEnd(18)} rule=${hit ? String(hit[0]).slice(0, 26) : "—"}`);
      console.log(`      ${f.text.replace(/\s+/g, " ").slice(0, 150)}`);
    }
    return "dumped";
  }
  // ---- the page loop ------------------------------------------------------
  //
  // Plenty of real applications are wizards: personal details, then education, then screening
  // questions, then review. Filling only the first page is filling almost none of the form.
  //
  // The loop is deliberately conservative. It advances only on a control that reads as "next" and
  // does NOT read as submit, it stops the moment a page has an unanswered REQUIRED field (which is
  // exactly where a human has to intervene anyway), and it stops if a click produced no new fields.
  const MAX_PAGES = 12;
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  let pageNo = 0;
  let lastSignature = "";
  let stopReason = "";
  let totalFilled = 0;
  let totalLeft = 0;
  const inventory = [];

  for (; pageNo < MAX_PAGES; pageNo++) {
    const pageFields = pageNo === 0 ? fields : await scan(page);
    const signature = pageFields.map((f) => f.text).join("|");
    if (pageNo > 0 && signature === lastSignature) {
      stopReason = "the page did not change — nothing more to fill";
      break;
    }
    lastSignature = signature;

    // RECON BEFORE FILL, always. Not a flag, and it costs nothing because the scan has already
    // happened: know what the page asks before committing answers to it.
    const seenHere = harvest(pageFields, rs, pageNo);
    inventory.push(...seenHere);
    const unanswered = seenHere.filter((q) => q.required && !q.answered);
    console.log(`\nRECON page ${pageNo + 1}: ${seenHere.length} question(s), ${seenHere.filter((q) => q.required).length} required, ${unanswered.length} required with no answer on file`);
    for (const q of unanswered) console.log(`  ✗ ${q.question.slice(0, 70)}`);

    if (reconOnly) {
      console.log(`  (recon only — nothing typed)`);
      stopReason = "recon only";
      break;
    }

    const { filled, skipped } = await fillPage(page, pageFields, rs, pdf);

    if (pageNo > 0) console.log(`\n${"─".repeat(78)}`);
    console.log(`${pageNo > 0 ? `PAGE ${pageNo + 1} — ` : ""}FILLED (${filled.length})`);
    for (const [k, v] of filled) console.log(`  ${pad(k, 46)}  ${v}`);
    const report = collapseGroups(skipped);
    if (report.length) {
      console.log(`\nLEFT FOR YOU (${report.length})`);
      for (const [k, v] of report) console.log(`  ${pad(k, 46)}  ${v}`);
    }
    totalFilled += filled.length;
    totalLeft += report.length;

    const next = await findNext(page);
    if (!next) {
      // END OF THE FORM. Nothing is pressed here, ever: an application cannot be unsubmitted, and a
      // form nobody read is a mistake with your name on it. The submit click is yours.
      stopReason = "last page reached — filled and NOT submitted. Read it, fix anything wrong, and press submit yourself";
      break;
    }
    const blocking = skipped.filter(([, why]) => /NO MATCH — and it is required/.test(why));
    if (blocking.length) {
      stopReason = `${blocking.length} required field(s) above still need you before this page can advance`;
      if (!interactive) break;
      console.log(`\n${blocking.length} required field(s) above are yours to answer.`);
      const go = await ask(`Fill them in the browser, then press Enter to move to the next page (or type "stop"): `);
      if (/^stop/i.test(go.trim())) {
        stopReason = "you stopped here";
        break;
      }
    } else if (interactive) {
      const go = await ask(`\nNext page? Press Enter to continue (or type "stop"): `);
      if (/^stop/i.test(go.trim())) {
        stopReason = "you stopped here";
        break;
      }
    }

    console.log(`\n→ ${next.label}`);
    await next.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(700);
  }

  // The inventory is written every run, not only on request — a question this tool cannot answer is
  // the single most useful thing to hand back, and it is worthless if it only exists on screen.
  const dir = outDir || path.join(ROOT, "output", slugFor(item));
  fs.mkdirSync(dir, { recursive: true });
  const qFile = path.join(dir, "form-questions.md");
  fs.writeFileSync(qFile, questionsMarkdown(item, inventory, stopReason));
  const blocked = inventory.filter((q) => q.required && !q.answered).length;
  console.log(`\n${pageNo + 1} page(s) processed — ${stopReason || "page limit reached"}. NOTHING SUBMITTED.`);
  console.log(`  ${inventory.length} question(s) recorded → ${path.relative(ROOT, qFile)}${blocked ? `  (${blocked} required with no answer)` : ""}`);
  return { filledCount: totalFilled, leftCount: totalLeft, stopReason, questions: inventory.length, blocked, pages: pageNo + 1 };
}

/** One question to the human, on the terminal. */
function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (a) => {
      rl.close();
      resolve(a || "");
    });
  });
}

/**
 * The control that moves to the next page of a wizard — and NEVER the one that sends the form.
 *
 * Two independent guards, because getting this wrong means an application submitted without anyone
 * reading it. A candidate must match NEXT_LIKE, and it must not match SUBMIT_LIKE, which already
 * covers submit/send/apply/finish/confirm/"continue to review". Anything ambiguous is left alone and
 * the loop simply stops, which costs a click and cannot cost an application.
 */
const NEXT_LIKE = /\b(next|continue|save\s*(and|&)\s*continue|proceed|step\s*\d)\b/i;

export function isNextControl(text) {
  const t = String(text || "");
  return NEXT_LIKE.test(t) && !SUBMIT_LIKE.test(t);
}

/**
 * IS THE FORM ARMED? — the fix for "There was an error verifying your application."
 *
 * This came out of Teamtailor's own bundle. Their application page ships:
 *
 *     <input type="hidden" name="city" id="city" value="true" data-careersite--form-target="city">
 *
 * and their Stimulus controller, on connect, does exactly one thing with it: `this.cityTarget.remove()`.
 * So `city` is a HONEYPOT. A real browser runs the controller, the field is deleted, and it is never
 * posted. Anything that submits the form before that controller has connected sends `city=true`, and
 * the server answers with precisely that error message.
 *
 * The failure is about TIMING, not about the browser's identity, and no amount of user-agent work
 * would ever have fixed it. Two things are checked:
 *
 *   1. NAMED honeypots that a known site deletes on connect. Teamtailor's `city` is the one measured.
 *   2. ANY hidden input still holding a truthy value that a controller is targeting — the general
 *      shape of the same trick, so a site this tool has never seen still gets the wait.
 *
 * Returns a verdict rather than throwing, because a form that never arms is something you need to be
 * told about in words, not a stack trace.
 */
export async function formReady(page, { timeoutMs = 12000 } = {}) {
  const probe = () =>
    page.evaluate(`(() => {
      const traps = [];
      // Teamtailor: removed by careersite--form on connect. Present == the controller has not run.
      const city = document.querySelector('input[type=hidden][name="city"][data-careersite--form-target="city"]');
      if (city) traps.push('city (Teamtailor honeypot — its own script deletes this when the form is ready)');
      // The general shape: a hidden input a Stimulus/Alpine/htmx controller is pointed at, still
      // carrying the value the server rendered.
      for (const el of document.querySelectorAll('input[type=hidden][value]')) {
        if (!el.name || el === city) continue;
        const targeted = [...el.attributes].some((a) => /^data-.*-target$/.test(a.name));
        if (targeted && el.value && /^(true|1|yes)$/i.test(el.value)) traps.push(el.name + ' (hidden flag a script should have cleared)');
      }
      return { traps, ready: document.readyState };
    })()`);

  const started = Date.now();
  let last = await probe();
  while (last.traps.length && Date.now() - started < timeoutMs) {
    await page.waitForTimeout(400);
    last = await probe();
  }
  return {
    armed: last.traps.length === 0,
    traps: last.traps,
    waitedMs: Date.now() - started,
  };
}

async function findNext(page) {
  const cands = await page.$$eval('button, a, input[type="button"], [role="button"]', (els) => {
    for (const old of els) old.removeAttribute("data-cvnext"); // stale markers point at the wrong page
    return els.map((el, i) => {
      el.setAttribute("data-cvnext", String(i));
      const r = el.getBoundingClientRect();
      return {
        i,
        visible: r.width > 0 && r.height > 0,
        disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
        text: [el.innerText, el.value, el.getAttribute("aria-label"), el.name, el.id].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      };
    });
  });
  const hit = cands.find((c) => c.visible && !c.disabled && isNextControl(c.text));
  if (!hit) return null;
  return {
    label: `next page via ${JSON.stringify(hit.text.slice(0, 40))}`,
    click: () => page.click(`[data-cvnext="${hit.i}"]`).catch(() => {}),
  };
}

/**
 * RECON — read every question on the page BEFORE anything is typed into it.
 *
 * On a wizard that is only physically possible one page at a time — you cannot see page 3 without
 * satisfying page 2 — so recon runs per page, immediately before that page is filled, and the
 * inventory accumulates. It groups the options of a multi-choice question back into one question,
 * marks which ones already have an answer, and flags a required question with no answer as the thing
 * that will block the run. The result is written to output/<slug>/form-questions.md.
 */
export function harvest(fields, rs, pageNo) {
  const byQuestion = new Map();
  for (const f of fields) {
    if (f.type === "hidden") continue;
    const grouped = (f.type === "radio" || f.type === "checkbox") && f.name;
    const key = grouped ? f.name : `idx:${f.idx}`;
    const rule = rs.find(([re]) => re.test(f.text.toLowerCase()));
    // For a grouped control the question is the tail of the description, not the option's own label.
    const label = grouped ? f.text.replace(/^[^|]*\|\s*/, "") : f.text;
    const cur = byQuestion.get(key);
    if (!cur) {
      byQuestion.set(key, {
        page: pageNo + 1,
        question: label.split("|")[0].replace(/\s+/g, " ").trim() || `<${f.tag} ${f.type}>`,
        type: f.type === "file" ? "file upload" : grouped ? `${f.type} group` : f.tag === "textarea" ? "long text" : f.type || "text",
        required: f.required,
        answered: rule ? rule[1] != null : f.type === "file" && /resume|\bcv\b/i.test(f.text),
        options: grouped && f.own ? [f.own] : [],
      });
    } else {
      cur.required = cur.required || f.required;
      cur.answered = cur.answered || (rule ? rule[1] != null : false);
      if (f.own) cur.options.push(f.own);
    }
  }
  return [...byQuestion.values()];
}

/** The inventory as a file you can work from — the questions, and which ones have no answer. */
export function questionsMarkdown(item, inventory, stopReason) {
  const blocked = inventory.filter((q) => q.required && !q.answered);
  const lines = [
    `# ${item.company} — ${item.title}`,
    "",
    `${item.url}`,
    "",
    `Read from the live form on ${new Date().toISOString().slice(0, 10)}, before anything was typed into it.`,
    `${inventory.length} question(s) across ${Math.max(...inventory.map((q) => q.page), 1)} page(s). Nothing was submitted.`,
    "",
    blocked.length
      ? `## ${blocked.length} required question(s) with NO answer on file\n\nThese are what stop the run. Add the answers to your profile (or to jobs/manual.json \`form_answers\` for this posting) and run again.\n`
      : "## Every required question has an answer on file\n",
    ...blocked.map((q) => `- **p${q.page}** ${q.question}${q.options.length ? `  \n  options: ${q.options.slice(0, 12).join(" · ")}${q.options.length > 12 ? ` … (${q.options.length} total)` : ""}` : ""}`),
    "",
    "Some of these may already be answered in `answers/<company>.md` — the hand-written sheet is not",
    "wired into the matcher, so a question can be covered there and still show as \"no\" here.",
    "",
    "## Everything it asks, in order",
    "",
    "| Page | Question | Type | Required | Answer on file |",
    "|---|---|---|---|---|",
    ...inventory.map((q) => `| ${q.page} | ${q.question.replace(/\|/g, "\\|").slice(0, 90)} | ${q.type} | ${q.required ? "yes" : ""} | ${q.answered ? "yes" : "**no**"} |`),
    "",
    `_Walk ended: ${stopReason || "page limit reached"}._`,
    "",
  ];
  return lines.join("\n");
}

/** Fill every control on the CURRENT page. Extracted so the page loop can call it once per page. */
export async function fillPage(page, fields, rs, pdf) {
  const filled = [];
  const skipped = [];

  for (const f of fields) {
    const hay = f.text.toLowerCase();
    if (wouldSubmit(hay) && f.tag !== "textarea") {
      skipped.push([f.text.slice(0, 60), "looks like a submit control — refused"]);
      continue;
    }
    if (f.type === "file") {
      // A file input is not automatically the CV slot. Greenhouse forms have "Resume/CV" AND "Cover
      // Letter" as separate uploads, and attaching the CV to both sends a CV labelled as a cover
      // letter. Only the resume slot gets it; anything else is yours to fill.
      if (!/resume|\bcv\b|curriculum/i.test(f.text)) {
        skipped.push([f.text.slice(0, 60), "a file upload that is not the CV — yours to attach", null]);
        continue;
      }
      if (!pdf) {
        skipped.push([f.text.slice(0, 60), "no CV file for this posting yet — run npm run daily", null]);
        continue;
      }
      await page.setInputFiles(`[data-cvfill="${f.idx}"]`, pdf).then(
        () => filled.push([f.text.slice(0, 46) || "file upload", path.basename(pdf)]),
        (e) => skipped.push([f.text.slice(0, 60), String(e.message).slice(0, 50)]),
      );
      continue;
    }
    const rule = rs.find(([re]) => re.test(hay));
    if (!rule) {
      skipped.push([
        f.text.slice(0, 60) || `<${f.tag} ${f.type}>`,
        f.required ? "NO MATCH — and it is required" : "no rule matched",
        // Options of one multi-choice question share a name. Group on it so the report shows the
        // question once instead of once per option.
        (f.type === "radio" || f.type === "checkbox") && f.name ? f.name : null,
      ]);
      continue;
    }
    const [, value] = rule;
    if (value == null) {
      skipped.push([f.text.slice(0, 60), "deliberately left blank — nothing truthful to put here"]);
      continue;
    }
    const r = await fillOne(page, f, value).catch((e) => ({ ok: false, why: String(e.message).slice(0, 50) }));
    if (r.ok) filled.push([f.text.slice(0, 46), String(r.wrote).replace(/\s+/g, " ").slice(0, 60)]);
    else skipped.push([f.text.slice(0, 60), r.why]);
  }

  return { filled, skipped };
}

// ---------------------------------------------------------------- self-test
// Run against local fixture forms and the FICTIONAL example profile, because pointing a test at a
// live application form means sending test applications to real recruiters, and a self-test must
// never read your data. The fixtures use the field names Greenhouse, Lever and Teamtailor actually use.
async function selfTest() {
  const profile = loadExample();
  const item = readJson(path.join(PROJECT_ROOT, "scripts", "fixtures", "example-posting.json"));
  const docs = answerBlocks(profile, item);
  const fixtures = path.join(PROJECT_ROOT, "scripts", "fixtures");
  const uni = profile.education[0];
  const school = profile.education[1];

  const server = http.createServer((req, res) => {
    const f = path.join(fixtures, path.basename(req.url.split("?")[0]) || "greenhouse-like.html");
    if (!fs.existsSync(f)) {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" }).end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(testPort(0), "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await launchBrowser().catch(exitIfNoBrowser);
  const page = await browser.newPage();
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " → " + detail}`);
    if (!ok) failed++;
  };

  const id = profile.identity;
  const expected = {
    first_name: id.name.split(" ")[0],
    last_name: id.name.split(" ").slice(1).join(" "),
    email: id.email,
    phone: id.phone,
    "address-line-1": id.address.line1,
    postcode: id.address.postcode,
    city: id.address.city,
    discipline: uni.subject,
  };

  for (const fixture of ["greenhouse-like.html", "lever-like.html"]) {
    await page.goto(`${base}/${fixture}`, { waitUntil: "domcontentloaded" });
    const fields = await scan(page);
    const rs = rules(profile, item, docs);
    for (const f of fields) {
      if (f.type === "file" || (wouldSubmit(f.text.toLowerCase()) && f.tag !== "textarea")) continue;
      const rule = rs.find(([re]) => re.test(f.text.toLowerCase()));
      if (rule && rule[1] != null) await fillOne(page, f, rule[1]).catch(() => {});
    }
    const got = await page.evaluate(`(() => {
      const o = {};
      for (const el of document.querySelectorAll('input, textarea, select')) if (el.name) o[el.name] = el.value;
      return o;
    })()`);
    for (const [name, want] of Object.entries(expected)) {
      if (!(name in got)) continue;
      check(`${fixture}: ${name}`, got[name] === want, `got ${JSON.stringify(got[name])}, wanted ${JSON.stringify(want)}`);
    }
    check(`${fixture}: sponsorship answered No`, /^no$/i.test(got.sponsorship || ""), `got ${JSON.stringify(got.sponsorship)}`);
    check(`${fixture}: work authorisation answered Yes`, /^yes$/i.test(got.work_auth || ""), `got ${JSON.stringify(got.work_auth)}`);
    check(`${fixture}: a free-text box received a real answer`, (got.why_us || "").length > 120, `got ${(got.why_us || "").length} chars`);
    // The refusal, proven rather than assumed: nothing was submitted and the password box is untouched.
    const state = await page.evaluate(`({ submitted: window.__submitted === true, pw: document.querySelector('input[type=password]')?.value ?? '' })`);
    check(`${fixture}: form was NOT submitted`, state.submitted === false, "the form fired submit");
    check(`${fixture}: password field untouched`, state.pw === "", "something was typed into a password box");
  }

  // GENERIC, both ways: the screeners come from the profile. The same form for a posting OUTSIDE the
  // profile's countries must leave sponsorship and work authorisation for the human, not answer them.
  {
    const abroad = { ...item, location: "Austin, Texas, United States" };
    const rs = rules(profile, abroad, docs);
    const resolve = (text) => (rs.find(([re]) => re.test(text.toLowerCase())) || [])[1];
    check("screeners: a role outside your countries leaves sponsorship for you", resolve("Will you require visa sponsorship?") === null, JSON.stringify(resolve("Will you require visa sponsorship?")));
    check("screeners: ...and work authorisation too", resolve("Are you legally authorized to work in the United States?") === null, JSON.stringify(resolve("Are you legally authorized to work in the United States?")));
  }

  // THE HONEYPOT WAIT, proven in both directions on a fixture that reproduces the real timing: the
  // trap is deleted by script after 1200ms. One run must WAIT and come back armed, and a form that
  // never arms must come back NOT armed with the trap named.
  {
    const hp = await launchBrowser();
    const hpage = await hp.newPage();

    await hpage.goto(`${base}/honeypot-like.html`, { waitUntil: "domcontentloaded" });
    const immediate = await hpage.evaluate(`Boolean(document.querySelector('input[name="city"]'))`);
    check("honeypot: the trap IS present the moment the page loads", immediate === true, `got ${immediate}`);

    const waited = await formReady(hpage, { timeoutMs: 6000 });
    check("honeypot: formReady WAITS for the site's script and reports armed", waited.armed === true, JSON.stringify(waited));
    check("honeypot: and it actually waited rather than answering instantly", waited.waitedMs >= 400, `waited ${waited.waitedMs}ms`);

    await hpage.goto(`${base}/honeypot-like.html?stuck=1`, { waitUntil: "domcontentloaded" });
    const stuck = await formReady(hpage, { timeoutMs: 2500 });
    check("honeypot: a form that never arms is reported NOT armed", stuck.armed === false, JSON.stringify(stuck));
    check("honeypot: and the trap is named in the report", stuck.traps.some((t) => /city/.test(t)), JSON.stringify(stuck.traps));

    await hp.close();
  }

  // ATTACHING TO A BROWSER THAT IS ALREADY RUNNING — the route apply.cmd takes. Start a browser with
  // --remote-debugging-port, connect over CDP, and drive a page in the context that was already there.
  {
    const port = await cdpPort();
    const real = await launchBrowser({ args: [`--remote-debugging-port=${port}`] });
    const attached = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const actx = attached.contexts()[0] || (await attached.newContext());
    const ap = actx.pages()[0] || (await actx.newPage());
    await ap.goto(`${base}/teamtailor-like.html`, { waitUntil: "domcontentloaded" });
    const title = await ap.title();
    check("attach: connectOverCDP reaches an already-running browser", title.includes("Teamtailor"), `got ${JSON.stringify(title)}`);
    const fields = await scan(ap);
    check("attach: the filler can see the form through the attached context", fields.length > 5, `saw ${fields.length} field(s)`);
    await attached.close();
    await real.close();
  }

  // THE AUTOMATION FINGERPRINT. With --disable-blink-features=AutomationControlled and
  // --enable-automation removed, navigator.webdriver must read FALSE. Asserted so a future change to
  // the launch options cannot quietly undo it.
  {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwprobe-"));
    const probe = await launchBrowser({
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    }, { persistentDir: probeDir });
    const pp = await probe.newPage();
    await pp.goto(`${base}/teamtailor-like.html`, { waitUntil: "domcontentloaded" });
    const wd = await pp.evaluate("navigator.webdriver");
    check("launch options: navigator.webdriver is FALSE", wd === false, `got ${JSON.stringify(wd)}`);
    await probe.close();
    fs.rmSync(probeDir, { recursive: true, force: true });
  }

  // RANGE SLIDERS, on the Teamtailor fixture. fill() throws on input[type=range], so a value inside
  // the range must land AND read back, and a value below the slider's own minimum must be REFUSED
  // rather than clamped and reported as filled.
  {
    await page.goto(`${base}/teamtailor-like.html`, { waitUntil: "domcontentloaded" });
    const fields = await scan(page);
    const bar = fields.find((f) => /bar experience/i.test(f.text));
    const age = fields.find((f) => /confirm your age/i.test(f.text));
    check("teamtailor: a range slider is seen as type=range", bar?.type === "range", `got ${JSON.stringify(bar?.type)}`);

    const zero = await fillOne(page, bar, "0").catch((e) => ({ ok: false, why: e.message }));
    check("teamtailor: slider set to 0 (zero years, honestly)", zero.ok === true && zero.wrote === "0", JSON.stringify(zero));

    const eighteen = await fillOne(page, age, "18").catch((e) => ({ ok: false, why: e.message }));
    check("teamtailor: slider set to 18", eighteen.ok === true && eighteen.wrote === "18", JSON.stringify(eighteen));

    // The age slider starts at min=16. Asking for 5 must not come back as a filled 16.
    const clamped = await fillOne(page, age, "5").catch((e) => ({ ok: false, why: e.message }));
    check(
      "teamtailor: a value below the slider's minimum is REFUSED, not silently clamped",
      clamped.ok === false && /clamped/.test(clamped.why || ""),
      JSON.stringify(clamped),
    );

    // The four-way DBS group: every option carries the same question, so only its own label decides.
    const none = fields.find((f) => f.type === "radio" && /^none$/i.test(f.own || ""));
    const enhanced = fields.find((f) => f.type === "radio" && /^enhanced$/i.test(f.own || ""));
    const pickNone = await fillOne(page, none, "None").catch((e) => ({ ok: false, why: e.message }));
    const refuse = await fillOne(page, enhanced, "None").catch((e) => ({ ok: false, why: e.message }));
    check("teamtailor: DBS 'None' is the option that gets ticked", pickNone.ok === true, JSON.stringify(pickNone));
    check("teamtailor: DBS 'Enhanced' is NOT ticked for the answer None", refuse.ok === false, JSON.stringify(refuse));

    const state = await page.evaluate(`({ submitted: window.__submitted === true })`);
    check("teamtailor: form was NOT submitted", state.submitted === false, "the form fired submit");
  }

  // Rule ORDER, on the exact question shapes real employer forms use. Each of these was a wrong answer
  // written confidently before it was a test. Expected values come from the example profile.
  {
    const rs = rules(profile, item, { whyUs: "", hardest: "", teamwork: "", learning: "", whyYou: "" });
    const resolve = (text) => (rs.find(([re]) => re.test(text.toLowerCase())) || [])[1];
    for (const [text, want, why] of [
      ["Yes | Are you legally authorized to work in the country for which you are applying? ✱", "Yes",
        "/\\bcountry\\b/ used to win and answered it with a country name"],
      ["No | Will you now or in the future require sponsorship for employment visa status?", "No", "sponsorship screener"],
      ["High School Name ✱", school.institution, "/school/ used to answer this with the university"],
      ["Year of High School Graduation ✱", school.end.slice(0, 4), "the school's leaving year, not the degree's"],
      ["Please include your intended graduation year for your degree", String(graduationYear(profile)), "/degree/ used to win and answered with the degree title"],
      ["Which university are you currently attending or most recently attended?", uni.institution, "still the university"],
    ])
      check(`rule order: ${text.slice(0, 44)}`, resolve(text) === want, `got ${JSON.stringify(resolve(text))}, wanted ${JSON.stringify(want)} — ${why}`);
  }

  // One option of a Yes/No pair must never be ticked because the OTHER one matched the question.
  for (const [own, want, expect] of [
    ["Yes", "Yes", true],
    ["No", "Yes", false],
    ["Yes", "No", false],
    ["No", "No", true],
    ["Not applicable", "No", false],
    ["I do not require sponsorship", "No", false],
    ["Yes, I consent", "Yes", true],
    ["Nope", "No", false],
  ])
    check(`option ${JSON.stringify(own)} means ${want}? ${expect}`, optionMeans(own, want) === expect);

  // Thirty-five checkboxes of one question are one line, not thirty-five.
  {
    const rows = [
      ["Current location", "NO MATCH", null],
      ["English (ENG) | Language Skill(s)", "NO MATCH", "cards[a]"],
      ["Spanish (SPA) | Language Skill(s)", "NO MATCH", "cards[a]"],
      ["French (FRA) | Language Skill(s)", "NO MATCH", "cards[a]"],
      ["Yes | Do you have upcoming exams?", "NO MATCH", "cards[b]"],
      ["No | Do you have upcoming exams?", "NO MATCH", "cards[b]"],
    ];
    const out = collapseGroups(rows);
    check("grouping: 6 rows collapse to 3", out.length === 3, `got ${out.length}`);
    check("grouping: the count is reported", /3 options/.test(out[1][1]), `got ${JSON.stringify(out[1][1])}`);
    check("grouping: ungrouped rows survive", out[0][0] === "Current location");
  }

  // The wizard: three pages, client-side switching, and a real Submit on the last one. The loop must
  // ADVANCE through the pages, and still refuse to send.
  {
    const page = await browser.newPage();
    await page.goto(`${base}/wizard-like.html`);
    const rs = rules(profile, item, docs);
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const fields = await scan(page);
      await fillPage(page, fields, rs, path.join(PROJECT_ROOT, "scripts", "apply.mjs"));
      const next = await findNext(page);
      seen.push(next ? next.label : null);
      if (!next) break;
      await next.click();
      await page.waitForTimeout(100);
    }
    const got = await page.evaluate(`(() => {
      const o = {};
      for (const el of document.querySelectorAll('input')) {
        if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
        else if (el.name) o[el.name] = el.value;
      }
      return o;
    })()`);

    check("wizard: page 1 filled", got.first_name === expected.first_name && got.email === profile.identity.email, JSON.stringify(got.first_name));
    check("wizard: ADVANCED to page 2", got.school === uni.institution, `school = ${JSON.stringify(got.school)}`);
    check("wizard: page 2 graduation year", got.grad_year === String(graduationYear(profile)), `got ${JSON.stringify(got.grad_year)}`);
    check("wizard: page 2 high school is the SCHOOL", got.high_school === school.institution, `got ${JSON.stringify(got.high_school)}`);
    check("wizard: ADVANCED to page 3", got.work_auth === "Yes", `work_auth = ${JSON.stringify(got.work_auth)}`);
    check("wizard: page 3 sponsorship answered No", got.sponsorship === "No", `got ${JSON.stringify(got.sponsorship)}`);
    check("wizard: an unknown required question is left alone", got.tshirt === undefined, `t-shirt was answered ${JSON.stringify(got.tshirt)}`);
    check("wizard: stopped at the Submit page", seen[seen.length - 1] === null, `last control was ${JSON.stringify(seen[seen.length - 1])}`);
    const submitted = await page.evaluate("window.__submitted === true");
    check("wizard: NOTHING WAS SUBMITTED", submitted === false, "the wizard fired submit");
    await page.close();
  }

  // The SHIPPED page loop, end to end: applyOne() — the exact function `npm run apply` runs — walked
  // over a wizard whose last page is complete apart from one question the profile cannot answer, with
  // a real Submit button waiting. It must reach that page and stop there with the form unsent.
  {
    const page = await browser.newPage();
    await page.goto(`${base}/wizard-like.html`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-selftest-"));
    const quiet = console.log;
    console.log = () => {};
    let res;
    try {
      res = await applyOne(page, { item, pdf: null, docs, profile, interactive: false, outDir: tmp });
    } finally {
      console.log = quiet;
    }
    const submitted = await page.evaluate("window.__submitted === true");
    check("applyOne: walked all three pages", res.pages === 3, JSON.stringify(res));
    check("applyOne: stopped on the last page without pressing anything", /NOT submitted/.test(res.stopReason), res.stopReason);
    check("applyOne: the form did NOT fire submit", submitted === false, "the wizard fired submit");
    check("applyOne: the unanswerable required question is recorded for you", /T-shirt/i.test(fs.readFileSync(path.join(tmp, "form-questions.md"), "utf8")), "not in form-questions.md");
    fs.rmSync(tmp, { recursive: true, force: true });
    await page.close();
  }

  // The next-vs-submit decision on its own, on the strings these buttons actually carry.
  for (const [text, expect] of [
    ["Next", true],
    ["Continue", true],
    ["Save and continue", true],
    ["Next step", true],
    ["Submit application", false],
    ["Continue to review", false],
    ["Send application", false],
    ["Apply now", false],
    ["Finish", false],
    ["Back", false],
  ])
    check(`next-control: ${JSON.stringify(text)} → ${expect}`, isNextControl(text) === expect);

  // And the guard itself, on the strings that actually appear on these buttons.
  for (const [text, expect] of [
    ["Submit application", true],
    ["Send", true],
    ["Apply for this job", true],
    ["Confirm and submit", true],
    ["First name", false],
    ["Why do you want to work here?", false],
  ])
    check(`refusal guard: ${JSON.stringify(text)} → ${expect}`, wouldSubmit(text) === expect);

  await browser.close();
  server.close();
  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test passed — fields match, and the never-submit rule is proven to fire");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("apply.mjs")) {
  if (process.argv.includes("--self-test")) await selfTest();
  else await run();
}
