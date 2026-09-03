#!/usr/bin/env node
/**
 * correction-capture — find the moments the OWNER corrected Execute, in a session transcript.
 *
 * Why this exists (reel DcbHSb1Ib3N, agent memory taxonomy: episodic / semantic / procedural):
 * Execute's episodic layer — PROJECT-LOG.md, memory/postmortems/ — records what EXECUTE DID.
 * It has never recorded the moments the owner said "no, that's wrong". Those are the highest-value
 * signal in the whole system and the only ones that were surviving by luck: they got written down
 * when somebody remembered to write them down. That is the same failure mode that lost the
 * agent-farm reel (see ideas/INBOX.md). A rule nothing runs is a rule that quietly stops happening.
 *
 * So this is a scanner, not a reminder. It reads the transcript and emits candidates.
 *
 * Usage:
 *   node scan.mjs                     # scan the newest transcript for this project
 *   node scan.mjs --transcript <path> # scan a specific .jsonl
 *   node scan.mjs --since 2026-08-20  # only turns on/after this date
 *   node scan.mjs --selftest          # prove the classifier, both directions
 */

import fs from "node:fs";
import path from "node:path";

/* ---------------------------------------------------------------------------
 * The classifier.
 *
 * A correction is not just a negative sentence. It is an utterance that refers back to something
 * the assistant just did or said and negates, rejects or amends it. Two tiers, because a single
 * flat keyword list is either too noisy to read or too narrow to catch anything:
 *
 *   STRONG — on its own, enough. Second-person negation ("u didnt"), demonstrative rejection
 *            ("thats not"), an assertion that the owner already said otherwise ("i said",
 *            "i alr"), a standing amendment ("next time", "from now on"), or a flat quality
 *            rejection ("its trash", "i hate").
 *   WEAK   — needs a second signal. Bare "not", "never", "only", "actually", "instead" — these
 *            appear constantly in ordinary instructions and questions.
 * ------------------------------------------------------------------------- */

export const STRONG = [
  [/\b(u|you)\s+(didn'?t|did\s+not|never)\b/i,        "second-person negation"],
  [/\b(u|you)\s+(was|were|are)\s+wrong\b/i,           "told it was wrong"],
  [/\bthat'?s\s+not\b|\bthats\s+not\b/i,              "demonstrative rejection"],
  [/\bthis\s+(isn'?t|is\s+not)\b/i,                   "demonstrative rejection"],
  [/\b(i|we)\s+(said|told\s+u|told\s+you|asked\s+for)\b/i, "owner already said otherwise"],
  [/\bi\s+(alr|already)\b/i,                          "owner already did it"],
  [/\bnext\s+time\b|\bfrom\s+now\s+on\b/i,            "standing amendment"],
  [/\bno\s+more\b/i,                                  "standing prohibition"],
  [/\b(it'?s|its)\s+(trash|shit|bad|rubbish)\b/i,     "quality rejection"],
  [/\bi\s+(lowk\s+)?hate\b/i,                         "quality rejection"],
  [/\bstop\s+\w+ing\b/i,                              "stop doing that"],
  [/\bwrong\b/i,                                      "called wrong"],
  [/\bdid\s+(u|you)\s+(acc|actually)\b/i,             "challenged a claim"],
  [/\bonly\s+(applies|for|to|in)\b/i,               "scope narrowing"],
];

export const WEAK = [
  [/\bactually\b/i,     "corrective adverb"],
  [/\binstead\b/i,      "substitution"],
  [/\bisn'?t\b|\bisnt\b/i, "negation"],
  [/\bnever\b/i,        "negation"],
  [/\bnot\b/i,          "negation"],
  [/\bgotta\b/i,        "obligation"],
  [/\bshould\s+(have|hav)\b/i, "counterfactual"],
  [/^\s*(no|nope|nah)\b/i, "flat no"],
];

export function classify(text) {
  const t = (text || "").trim();
  if (!t) return { isCorrection: false, score: 0, signals: [] };
  const signals = [];
  let score = 0;
  for (const [re, label] of STRONG) if (re.test(t)) { signals.push(label); score += 2; }
  for (const [re, label] of WEAK)   if (re.test(t)) { signals.push(label); score += 1; }
  return { isCorrection: score >= 2, score, signals: [...new Set(signals)] };
}

/* ---------------------------------------------------------------------------
 * Transcript reading. A user turn's content may be a bare string, or a block list that also
 * carries tool_result payloads and <system-reminder> injections — neither of which the owner
 * typed. Counting those as owner speech would flood the output with machine text.
 * ------------------------------------------------------------------------- */

export function userText(msg) {
  const c = msg?.content;
  if (typeof c === "string") return stripInjected(c);
  if (!Array.isArray(c)) return "";
  const parts = [];
  for (const b of c) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "tool_result") return "";          // a whole turn that is tool output, not speech
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
  }
  return stripInjected(parts.join("\n"));
}

export function stripInjected(s) {
  return s
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<command-name>[\s\S]*?<\/command-message>/g, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
    .trim();
}

/**
 * Not everything wearing a user role was typed by the owner. Compaction summaries, injected skill
 * bodies and local-command output all arrive as user turns, and they are FULL of the words this
 * classifier looks for — a summary of a session about corrections reads exactly like a correction.
 * Found by running the scanner against a real transcript: 4 of the first 12 hits were machine text.
 */
export const MACHINE_PREFIXES = [
  "This session is being continued from a previous conversation",
  "Base directory for this skill:",
  "Caveat: The messages below were generated by the user while running local commands",
  "<command-name>",
  "Prompt is too long",
];

export function isMachineTurn(text) {
  const t = (text || "").trimStart();
  return MACHINE_PREFIXES.some(p => t.startsWith(p));
}

function assistantText(msg) {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter(b => b?.type === "text" && typeof b.text === "string").map(b => b.text).join("\n");
}

export function scanTranscript(file, { since } = {}) {
  const found = [];
  let lastAssistant = "";
  let lastTs = "";
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const m = d.message;
    if (!m) continue;
    const ts = d.timestamp || lastTs;
    if (m.role === "assistant") { const a = assistantText(m); if (a) { lastAssistant = a; lastTs = ts; } continue; }
    if (m.role !== "user") continue;
    const text = userText(m);
    if (!text || isMachineTurn(text)) continue;
    if (since && ts && ts.slice(0, 10) < since) continue;
    const v = classify(text);
    if (!v.isCorrection) continue;
    found.push({
      when: (ts || "").slice(0, 10),
      score: v.score,
      signals: v.signals,
      correction: text.length > 400 ? text.slice(0, 400) + " …" : text,
      corrected: lastAssistant.length > 300 ? lastAssistant.slice(0, 300) + " …" : lastAssistant,
    });
  }
  return found;
}

export function newestTranscript(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".jsonl")).map(f => path.join(dir, f));
  if (!files.length) return null;
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

/* --------------------------------------------------------------------------- selftest */

// Every one of these is a real owner message from a real session. The FLAG list is the corrections
// that actually changed how Execute works; the PASS list is ordinary instructions and questions
// from the same sessions. A classifier proven only on the things it should catch is not proven —
// the expensive failure mode here is flagging every instruction as a correction until the report
// is too noisy to read, and only the PASS list can catch that.
const FIXTURES_FLAG = [
  "u didnt use any of the effects and i lowk hate the photo ill send a diff one",
  "cl its trash before we continue i want u to gimme a recap of all the reels",
  "isnt the graphify code public? did u acc read all the files",
  "only applies to linkedin do u remember the project in ideas wher u have to make money",
  "thats not the idea and furthermore after checking the ideas folder it isnt there",
  "next time js put the url in ideas with a description of the reel when i say to add it to ides",
  "1 no more omni route explain 2?",
  "next i alr applied for black rock",
];
const FIXTURES_PASS = [
  "next reel",
  "explain 3",
  "add this to ideas",
  "https://www.instagram.com/reel/DcbznNmS3ZX/",
  "show me a vid of u using it and showcasing all its features",
  "how did u implement reel 8",
  "Continue from where you left off.",
  "implement graphify in the way that is as effective but as u see fit",
  "where should i put the api key then lets go to the next reel",
  "But make more of a script per se that I can read",
];

function selftest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };

  for (const t of FIXTURES_FLAG) check(classify(t).isCorrection, `should FLAG: ${t.slice(0, 60)}`);
  for (const t of FIXTURES_PASS) check(!classify(t).isCorrection, `should PASS: ${t.slice(0, 60)}`);

  // structural
  check(userText({ content: [{ type: "tool_result", content: "u didnt do it" }] }) === "",
    "a tool_result turn is not owner speech");
  check(stripInjected("<system-reminder>u didnt</system-reminder>hi") === "hi",
    "system-reminder text is stripped before classifying");
  check(classify("").isCorrection === false, "empty text is not a correction");
  check(classify("not").isCorrection === false, "a single weak signal is below threshold");
  check(classify("actually not").isCorrection === true, "two weak signals reach threshold");
  check(classify("u didnt").score === 2, "one strong signal scores 2");
  check(classify("thats not the idea").signals.includes("demonstrative rejection"), "signals are reported");

  // machine turns wearing a user role — the noise that a real transcript run exposed
  for (const p of MACHINE_PREFIXES)
    check(isMachineTurn(p + " u didnt do it and thats not the idea"), `machine turn rejected: ${p.slice(0, 40)}`);
  check(!isMachineTurn("u didnt use any of the effects"), "real owner speech is NOT rejected as machine");
  check(!isMachineTurn("next reel"), "short owner speech is NOT rejected as machine");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ` +
    `(${FIXTURES_FLAG.length} must-flag, ${FIXTURES_PASS.length} must-not-flag, ${7 + MACHINE_PREFIXES.length + 2} structural)`);
  return fail === 0 ? 0 : 1;
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

  if (argv.includes("--selftest")) process.exit(selftest());

  const file = arg("--transcript") ||
    newestTranscript(path.join(process.env.HOME || "/root", ".claude", "projects",
      "-" + process.cwd().replace(/^\//, "").replace(/\//g, "-")));

  if (!file || !fs.existsSync(file)) {
    console.error("no transcript found — pass --transcript <path>");
    process.exit(2);
  }

  const found = scanTranscript(file, { since: arg("--since") });
  console.log(`# correction candidates — ${path.basename(file)}${arg("--since") ? ` since ${arg("--since")}` : ""}\n`);
  if (!found.length) { console.log("_none found._"); process.exit(0); }
  for (const f of found) {
    console.log(`## ${f.when || "?"}  (score ${f.score}: ${f.signals.join(", ")})`);
    console.log(`**Owner:** ${f.correction.replace(/\n+/g, " ")}\n`);
    console.log(`**Was correcting:** ${f.corrected.replace(/\n+/g, " ").slice(0, 240)}\n`);
  }
  console.log(`\n_${found.length} candidate(s). These are CANDIDATES — a human or the learner decides which are real and what each one changes._`);
}
