#!/usr/bin/env node
/**
 * DASHBOARD — the one file you open.
 *
 * Self-contained by design: no server, no build, no fonts or scripts fetched from anywhere. A
 * bookmark has to work by double-clicking, on any machine, months from now.
 *
 * Structured by the question you actually have at 9am, which is not "what exists" but "what should I
 * do next":
 *
 *   APPLY NOW    passed every eligibility rule · sorted by deadline, then fit
 *   WORTH A LOOK something could not be determined — kept deliberately, because the gate leans
 *                permissive. Missing a real opportunity costs more than a glance.
 *   RULED OUT    collapsed, with the reason. Shown rather than hidden so the filter can be caught
 *                being wrong — a filter nobody can audit is just a thing that loses your mail.
 *
 * Every card carries its tailored CV and gap analysis, because a document you have to ask for does
 * not exist when you need it.
 */

import fs from "node:fs";
import path from "node:path";
import { loadFound, pdfNameFor, slugFor } from "./tailor.mjs";
import { decisions, isDecided, normalizeUrl } from "./decisions.mjs";
import { barLabel, boostKeywords, homeRegex, intakeLabel, loadProfile, offerToBeat, sourcesFileFor } from "./profile.mjs";

const ROOT = process.cwd();
const found = loadFound();
const profile = loadProfile();
const BAR = barLabel(profile); // "your <employer> offer", or "your bar" when no offer is held
const OFFER = offerToBeat(profile);
const appsFile = path.join(ROOT, "applications", "applications.json");
const apps = fs.existsSync(appsFile) ? JSON.parse(fs.readFileSync(appsFile, "utf8")).applications : [];
const appliedUrls = new Set(apps.map((a) => a.url).filter(Boolean));

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Documents are INLINED, not linked. The first version linked to output/<slug>/cv.md, which cannot
 * resolve when the file is opened on its own — and a .md link would not render in a browser anyway.
 * "Self-contained" has to include the thing the page exists to deliver, so the CV and gap analysis
 * are embedded and expand in place.
 */
const readDoc = (o, name) => {
  const f = path.join(ROOT, "output", slugFor(o), name);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
};

/**
 * The PDF is LINKED, not inlined — the one deliberate exception to the self-contained rule.
 *
 * Inlining thirteen 350 KB PDFs as base64 makes a 6 MB dashboard, and the daily job commits a fresh
 * copy of that file every time anything changes. Linking keeps the page at ~110 KB and, more to the
 * point, gives a real file on disk: application forms want a file picker, and you cannot drag a
 * data: URI into one. The download link resolves whenever dashboard.html sits next to its output/
 * folder, which is what the daily job's zip artifact and a local clone both give you.
 */
const pdfHref = (o) => {
  const rel = path.join("output", slugFor(o), pdfNameFor(o));
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
};

/** Just enough markdown for what tailor.mjs emits — headings, bold, italics, bullets, rules. */
function md(src) {
  const lines = src.split("\n");
  const out = [];
  let inList = false;
  const inline = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^- /.test(l)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (/^### /.test(l)) out.push(`<h5>${inline(l.slice(4))}</h5>`);
    else if (/^## /.test(l)) out.push(`<h4>${inline(l.slice(3))}</h4>`);
    else if (/^# /.test(l)) out.push(`<h3 class="docname">${inline(l.slice(2))}</h3>`);
    else if (/^---+$/.test(l)) out.push("<hr>");
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

/** One line of "why this is here", from YOUR profile: home city, remote, your boost keywords. */
function why(o) {
  const hay = `${o.title} ${o.location} ${o.company}`;
  const r = [];
  const home = homeRegex(profile);
  const m = home && home.exec(hay);
  if (m) r.push(`${m[0]} — home city, no relocation`);
  else if (/\b(online|virtual|remote)\b/i.test(hay)) r.push("remote");
  const hits = boostKeywords(profile).filter((k) => new RegExp(`\\b${String(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay));
  if (hits.length) r.push(`matches ${hits.join(", ")}`);
  if (o.prize) r.push(`prize ${o.prize}`);
  return r.join(" · ") || "in scope";
}

const card = (o) => {
  const el = o.eligibility || { verdict: "check", blockers: [], unclear: [] };
  const cv = readDoc(o, "cv.md");
  const gap = readDoc(o, "gap.md");
  const answers = readDoc(o, "answers.md");
  const pdf = pdfHref(o);
  const notes = el.verdict === "ineligible" ? el.blockers : el.unclear;
  return `
  <article class="card v-${esc(el.verdict)}">
    <div class="score" title="fit score">${o.score ?? "–"}</div>
    <div class="main">
      <h3><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}</a></h3>
      <p class="meta">
        <span class="tag t-${esc(o.kind || "job")}">${esc(o.kind || "job")}</span>
        <b>${esc(o.company)}</b><span class="dot">·</span>${esc(o.location || "—")}
        ${o.deadline ? `<span class="dot">·</span><span class="dl">${esc(o.deadline)}</span>` : ""}
      </p>
      <p class="why">${esc(why(o))}</p>
      ${
        // The bar's reasoning, shown rather than summarised. A tier with no working is a verdict you
        // cannot argue with, and you have to be able to argue with this one — the employer classes in
        // bar.mjs are judgement calls, and the fastest way to catch a wrong one is to read the line
        // that produced it.
        o.bar?.reasons?.length
          ? `<details class="doc bar-why"><summary>Against ${esc(BAR)}: <b>${esc(o.bar.tier)}</b></summary><ul class="notes">${o.bar.reasons.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>`
          : ""
      }
      ${notes?.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="act">
        <a class="btn" href="${esc(o.url)}" target="_blank" rel="noopener">Open &amp; apply</a>
        ${
          pdf
            ? `<a class="btn btn-pdf" href="${esc(pdf)}" download="${esc(pdfNameFor(o))}">Download CV (PDF)</a>`
            : cv
              ? `<span class="muted">PDF not rendered — run <code>npm run pdf</code></span>`
              : `<span class="muted">no documents — ruled out</span>`
        }
      </p>
      ${cv ? `<details class="doc"><summary>Read the CV — the same words that are in the PDF</summary><div class="docbody">${md(cv)}</div></details>` : ""}
      ${gap ? `<details class="doc"><summary>Gap analysis — what you have, what you don't</summary><div class="docbody">${md(gap)}</div></details>` : ""}
      ${answers ? `<details class="doc"><summary>Application answers — the supplementary questions, drafted</summary><div class="docbody">${md(answers)}</div></details>` : ""}
    </div>
  </article>`;
};

/**
 * DECIDED ROWS NEVER REACH THE PAGE.
 *
 * A posting you applied to or ignored is never shown twice. This used to hide applied rows from the
 * live sections and then print them again under
 * "Already applied" — which is showing them twice, just politely. Applied and ignored are now both
 * filtered out at the source, before any section sees them, so no section can leak one back.
 *
 * They are COUNTED, not silently vanished: a filter whose effect you cannot see is indistinguishable
 * from a bug, and the count is what tells you the ignore actually took.
 */
const decided = decisions(ROOT);
const allRows = [...found.jobs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
const rows = allRows.filter((o) => !isDecided(decided, o.url));
const hiddenCount = allRows.length - rows.length;
const hiddenApplied = allRows.filter((o) => decided.get(normalizeUrl(o.url))?.decision === "applied").length;
const hiddenIgnored = hiddenCount - hiddenApplied;
const verdict = (o) => (appliedUrls.has(o.url) ? "applied" : o.eligibility?.verdict ?? "check");

/**
 * THE BAR — `scripts/bar.mjs` computes a second axis (is this an upgrade on your bar, or on the
 * offer you hold?) and `discover.mjs` stores it on every row; this is where it changes what you see.
 *
 * It re-ranks rather than deletes. A lateral or unknown row is still a real opportunity and still
 * visible further down — the upgrades come first, the rest is not hidden.
 */
const beatsBar = (o) => (o.bar?.tier ?? "unknown") === "beats";

// PRIORITY outranks the score, and it is the only thing that does. The score is this tool's guess at
// relevance; a priority is you saying "do this one". Ranking a guess above an instruction would be the
// wrong way round, and burying the things you personally chose among a hundred "worth a look" rows is
// how a shortlist stops being one.
//
// It does NOT bypass the eligibility gate. A priority row with a passed deadline is still a passed
// deadline — it appears in "Ruled out" like anything else, because the alternative is a section that
// tells you to do something you cannot do.
const priority = rows
  .filter((o) => o.priority && verdict(o) !== "ineligible" && verdict(o) !== "applied")
  .sort((a, b) => a.priority - b.priority);
const isPriority = new Set(priority.map((o) => o.url));

const live = (o) => verdict(o) !== "ineligible" && verdict(o) !== "applied" && !isPriority.has(o.url);
// Beats the bar AND is applicable — the shortlist.
const beats = rows.filter((o) => live(o) && beatsBar(o)).sort((a, b) => (b.score || 0) - (a.score || 0));
const isBeats = new Set(beats.map((o) => o.url));
const apply = rows.filter((o) => verdict(o) === "eligible" && !isPriority.has(o.url) && !isBeats.has(o.url));
const look = rows.filter((o) => verdict(o) === "check" && !isPriority.has(o.url) && !isBeats.has(o.url));
const out = rows.filter((o) => verdict(o) === "ineligible");
// Applied postings are filtered out of `rows` above, so counting them there would always be 0.
// The count comes from the decision set, which is where the answer actually is.
const done = { length: hiddenApplied };

/**
 * The sources this tool CANNOT reach, on the page you actually open.
 *
 * The employer list discover used (jobs/sources.json, else the shipped example for your sector)
 * records them under tier2_browser_required — a site behind a bot wall, a page that
 * is an empty JS shell. Recorded only in a JSON file nobody opens, a source could sit there for weeks
 * looking handled. Silence from a blocked source is indistinguishable from "nothing new today", so
 * they are shown here.
 *
 * So they are rendered here, with what was measured and when. Not as an apology — as a checklist.
 */
const blockedSection = () => {
  const p = sourcesFileFor(profile, { root: ROOT });
  if (!fs.existsSync(p)) return "";
  const list = JSON.parse(fs.readFileSync(p, "utf8")).tier2_browser_required || [];
  if (!list.length) return "";
  return `<section><h2>Check these yourself <span class="count">${list.length}</span></h2>
    <p class="note">Nothing below can be fetched by this tool — each one needs a real browser, and
    some need your login. They are listed because a source that silently returns nothing looks
    exactly like a quiet day. Each entry says what was measured, and when.</p>
    ${list
      .map((t) => {
        const measured = Object.entries(t).find(([k]) => k.startsWith("measured_"));
        const when = measured ? measured[0].replace("measured_", "").replace(/_/g, "-") : "not dated";
        // .card is display:flex, so its children must live inside .main (flex:1) exactly as the
        // opportunity cards do — otherwise three paragraphs sit side by side in three columns.
        return `<article class="card v-check"><div class="main">
          <h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a></h3>
          <p class="meta">Measured ${esc(when)}</p>
          <p class="notes">${esc(measured ? measured[1] : "—")}</p>
          <p class="notes">${esc(t.handling || "")}</p>
          ${t.trap ? `<p class="notes"><b>Trap:</b> ${esc(t.trap)}</p>` : ""}
        </div></article>`;
      })
      .join("")}</section>`;
};

const section = (title, note, items, open = true) =>
  items.length
    ? `<section><h2>${title} <span class="count">${items.length}</span></h2>
       <p class="note">${note}</p>${items.map(card).join("")}</section>`
    : `<section><h2>${title} <span class="count">0</span></h2><p class="note empty">${note}</p></section>`;

const html = `<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opportunities</title>
<style>
  :root{
    --paper:#faf8f3; --ink:#16180f; --muted:#77796d; --line:#e6e1d6;
    --accent:#3f6d52; --warn:#b4763f; --dead:#a9a396; --card:#fff;
  }
  @media(prefers-color-scheme:dark){:root{
    --paper:#121309; --ink:#f0eee6; --muted:#8f9184; --line:#282a20;
    --accent:#7fae91; --warn:#d09a63; --dead:#5d5f54; --card:#1a1c12;
  }}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;padding:3rem 1.25rem 6rem;background:var(--paper);color:var(--ink);
    font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    font-feature-settings:"cv11","ss01"}
  .wrap{max-width:54rem;margin:0 auto}
  header{margin-bottom:3rem}
  h1{font-size:clamp(1.9rem,4vw,2.6rem);letter-spacing:-.02em;margin:0 0 .4rem;font-weight:600}
  .sub{color:var(--muted);margin:0;font-size:.92rem;max-width:44rem}
  .strap{display:flex;gap:1.4rem;margin-top:1.4rem;flex-wrap:wrap;
    padding-top:1.2rem;border-top:1px solid var(--line)}
  .stat b{display:block;font-size:1.5rem;font-weight:600;line-height:1.1}
  .stat span{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
  section{margin-top:3.2rem}
  h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.13em;color:var(--muted);
    font-weight:600;margin:0 0 .3rem;display:flex;align-items:center;gap:.6rem}
  .count{background:var(--line);color:var(--muted);border-radius:20px;
    padding:.05rem .5rem;font-size:.7rem;letter-spacing:0}
  .note{margin:0 0 1.2rem;font-size:.85rem;color:var(--muted);max-width:42rem}
  .note.empty{font-style:italic}
  .card{display:flex;gap:1.1rem;background:var(--card);border:1px solid var(--line);
    border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:.7rem}
  .card.v-ineligible{opacity:.5}
  .score{flex:0 0 2.2rem;height:2.2rem;border-radius:8px;display:grid;place-items:center;
    font-weight:600;font-size:.9rem;background:var(--accent);color:var(--paper)}
  .v-check .score{background:var(--warn)}
  .v-ineligible .score{background:var(--dead)}
  .main{flex:1;min-width:0}
  h3{margin:0 0 .35rem;font-size:1.02rem;font-weight:600;letter-spacing:-.01em}
  h3 a{color:inherit;text-decoration:none}
  h3 a:hover{text-decoration:underline;text-underline-offset:3px}
  .meta{margin:0 0 .5rem;font-size:.84rem;color:var(--muted);display:flex;
    align-items:center;gap:.4rem;flex-wrap:wrap}
  .dot{opacity:.5}
  .dl{color:var(--warn)}
  .tag{font-size:.64rem;text-transform:uppercase;letter-spacing:.07em;padding:.12rem .42rem;
    border-radius:4px;border:1px solid var(--line);color:var(--muted)}
  .tag.t-hackathon{border-color:var(--accent);color:var(--accent)}
  .why{margin:0 0 .5rem;font-size:.87rem}
  .notes{margin:.1rem 0 .6rem;padding-left:1.1rem;font-size:.8rem;color:var(--muted)}
  .notes li{margin:.1rem 0}
  .act{margin:0;display:flex;gap:.7rem;align-items:center;flex-wrap:wrap}
  .btn{background:var(--ink);color:var(--paper);padding:.34rem .85rem;border-radius:6px;
    text-decoration:none;font-size:.82rem;font-weight:500}
  .btn:hover{opacity:.85}
  .btn-pdf{background:var(--accent);color:var(--paper)}
  .lnk{font-size:.8rem;color:var(--accent);text-decoration:none;border-bottom:1px solid transparent}
  .lnk:hover{border-bottom-color:currentColor}
  .muted{font-size:.78rem;color:var(--muted)}
  .doc{margin-top:.7rem;border-top:1px solid var(--line);padding-top:.55rem}
  .doc summary{cursor:pointer;font-size:.82rem;color:var(--accent);list-style:none;
    display:flex;align-items:center;gap:.4rem;user-select:none}
  .doc summary::-webkit-details-marker{display:none}
  .doc summary::before{content:"▸";font-size:.7rem;transition:transform .15s}
  .doc[open] summary::before{transform:rotate(90deg)}
  .docbody{margin-top:.7rem;padding:.9rem 1rem;background:var(--paper);border-radius:8px;
    font-size:.83rem;max-height:32rem;overflow:auto}
  .docbody .docname{font-size:1rem;margin:0 0 .5rem}
  .docbody h4{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);
    margin:1.1rem 0 .35rem;font-weight:600}
  .docbody h5{font-size:.86rem;margin:.7rem 0 .1rem;font-weight:600}
  .docbody p{margin:.25rem 0}
  .docbody ul{margin:.3rem 0 .5rem;padding-left:1.1rem}
  .docbody li{margin:.15rem 0}
  .docbody hr{border:0;border-top:1px solid var(--line);margin:1rem 0}
  footer{margin-top:4rem;padding-top:1.2rem;border-top:1px solid var(--line);
    font-size:.8rem;color:var(--muted)}
  code{background:var(--line);padding:.1rem .34rem;border-radius:4px;font-size:.85em}
</style></head><body><div class="wrap">

<header>
  <h1>What to do next</h1>
  <p class="sub">
    Ranked against ${esc(profile.identity?.name || "your")}'s profile${intakeLabel(profile) ? ` for ${esc(intakeLabel(profile))}` : ""}.
    ${OFFER ? `You already hold ${esc(BAR)}, so the question is what beats it.` : "No offer in hand, so the upgrades are the strongest fits for your bar."}
    Two separate checks run on every row: whether you <em>can</em> apply (freshness, intake year, year
    group, location, work authorisation) and whether it is an upgrade (a confirmed internship, at a
    firm or in a city that is an upgrade). Nothing is hidden; the upgrades are just first.
  </p>
  <div class="strap">
    <div class="stat"><b>${beats.length}</b><span>beats ${esc(OFFER ? OFFER.employer : "the bar")}</span></div>
    <div class="stat"><b>${apply.length}</b><span>ready</span></div>
    <div class="stat"><b>${look.length}</b><span>worth a look</span></div>
    <div class="stat"><b>${out.length}</b><span>ruled out</span></div>
    <div class="stat"><b>${done.length}</b><span>applied</span></div>
    <div class="stat"><b>${esc((found.updated || "").slice(5, 10))}</b><span>updated</span></div>
  </div>
</header>

${
  priority.length
    ? `<section><h2>Do these first <span class="count">${priority.length}</span></h2>
       <p class="note">You picked these yourself, so they sit above the score — in the order you gave
       them, with the closest deadline named on each. They still went through every eligibility rule;
       nothing here is exempt, it is just not buried.</p>${priority.map(card).join("")}</section>`
    : ""
}
${section(`Beats ${esc(OFFER ? OFFER.employer : "your bar")}`, "Confirmed internships that are an upgrade — a stronger firm, your home city, or more pay. This is the list to work down. Each card's notes say which axis it won on.", beats)}
${section("Applicable, but not an upgrade", "Passed every eligibility rule, and you could apply — but on your own stated bar it is a sideways move or the posting does not confirm it is an internship. Kept visible so the bar can be caught being wrong.", apply)}
${section("Worth a look", "Something could not be determined from the posting — kept rather than dropped, because missing a real opportunity costs more than a glance. The notes say what was unclear.", look)}
${section("Ruled out", "Shown rather than hidden, so the filter can be caught being wrong. If something here should have passed, the rule that rejected it is named.", out)}
${blockedSection()}

<footer>
  <b>Download CV (PDF)</b> gives you the file to attach to the application — one per role, ordered
  against that posting, A4, text-selectable so an applicant tracking system can read it. It needs the
  <code>output/</code> folder sitting next to this page; keep them together.<br>
  Regenerated daily. By hand: <code>npm run daily</code>.<br>
  Every claim in every generated document traces to the master profile — <code>npm run ground</code>
  fails the build if not. Tone and overstatement still need your eyes.
</footer>
</div></body></html>
`;

fs.writeFileSync(path.join(ROOT, "dashboard.html"), html);
console.log(`dashboard.html — ${apply.length} ready · ${look.length} worth a look · ${out.length} ruled out`
  + ` · ${hiddenCount} hidden (${hiddenApplied} applied, ${hiddenIgnored} ignored)`);
