#!/usr/bin/env node
/**
 * lint-brief — check a sub-agent brief for the clauses this repo has already paid to learn.
 *
 * Every rule below exists because its absence cost something real; the cost is in the rule's
 * `cost` field and in SKILL.md's register. This is deliberately a LINTER and not a judge: it cannot
 * tell whether a brief is well written, only whether it carries the clauses whose absence has
 * previously produced a hung agent, a lost tree, a gamed metric or an unfalsifiable report.
 *
 *   node lint-brief.mjs <brief.txt>        # lint a file
 *   node lint-brief.mjs --selftest
 *
 * Exit 0 clean, 1 with findings, 2 on usage error.
 */

import fs from "node:fs";

export const RULES = [
  {
    id: "sync-checks",
    need: /synchronous|synchronously|foreground|do not spawn a monitor|not.{0,20}background task/i,
    say: "say how to run long checks — synchronously, in the foreground, never by spawning a monitor and waiting",
    cost: "an agent invented a wait-on-monitor loop and burned 371,672 tokens over 196 tool calls before it was killed",
  },
  {
    // Added after the clause above FAILED TO WORK. A brief carrying it still produced a
    // wait-on-monitor loop, and the agent's own explanation was that the check "exceeded the 120s
    // foreground default and was moved to background by the harness". The instruction was therefore
    // impossible to follow as written: "run it in the foreground" without saying HOW leaves the
    // agent with a tool that times out at 120s and a check that takes longer. Telling it to do the
    // impossible is a worse defect than not mentioning it, because the agent then improvises.
    id: "timeout-budget",
    need: /timeout[^.]{0,80}(600000|600,000|10 minutes|ten minutes)|\btimeout:\s*\d{5,6}/i,
    say: "give long checks an explicit timeout — the Bash tool defaults to 120s and silently backgrounds anything slower, so name the parameter and the ceiling (up to 600000ms)",
    cost: "a brief that said 'run it in the foreground' but not how produced the very wait-loop it was written to prevent, a third time",
  },
  {
    id: "no-gaming",
    need: /would make the number better and the page worse|gaming the (scorer|metric)|never edit (a|the) check|not (edit|touch) the checks/i,
    say: "include the anti-gaming clause: a change that improves the number and worsens the artifact is not a change, and checks are never edited",
    cost: "an agent set a hero to 190vh purely to move the page-aspect number",
  },
  {
    id: "commit-urgency",
    need: /commit[^.]{0,60}(per green unit|as you go)/i,
    say: "require committing per green unit",
    cost: "three agents were killed mid-build holding uncommitted trees",
  },
  {
    id: "container-resets",
    need: /container is reset|uncommitted tree can|reset between turns/i,
    say: "state WHY committing is urgent — the container resets between turns and an uncommitted tree can vanish",
    cost: "the same three agents; 'commit as you go' without the reason reads as tidiness, not as urgency",
  },
  {
    id: "no-push",
    need: /do not push|don't push|never push/i,
    say: "say explicitly not to push — the parent pushes, after the gates",
    cost: "a push from an agent bypasses the parent's gate sequencing",
  },
  {
    id: "evidence-contract",
    need: /paste the real command output|command output.{0,40}(not accepted|required)|prove it/i,
    say: "state the evidence contract: paste real command output, and a claim without it is not accepted",
    cost: "agents reported success in prose with nothing runnable behind it",
  },
  {
    id: "name-unverified",
    need: /did not verify|not verif|unverified/i,
    say: "require the agent to name what it did NOT verify",
    cost: "an honest gap list is what makes the proven parts believable",
  },
  {
    id: "definition-of-done",
    need: /npm run build|tsc --noEmit|run\.sh|design-loop\.sh/i,
    say: "name the exact commands that constitute done",
    cost: "a vague definition of done produces a confident report and a broken tree",
  },
  {
    /**
     * Added after the THIRD time an unverified evaluator finding was relayed into a brief and cost an
     * iteration. A judge is an evaluator, not an oracle: it sees a sample of rendered frames and it
     * can be wrong about the reference. Every finding put in front of a builder must first be checked
     * against ground truth, and the brief must name the evidence so the builder can check it too.
     *
     * The three: "cut the micro-label clutter" produced product screens with zero type, when the
     * reference anchors that same emptiness with one tracked label. "Restore the dark closing CTA"
     * was a sampling artifact — the CTA was already there and full-height, and the judge's frames had
     * stepped over it. "The reference is near-monochrome, desaturate" was contradicted by the
     * reference's own stills, where the aerial ship frame is the most saturated screen on the page.
     */
    id: "cite-the-evidence",
    need: /reference\/slices|s\d\d-\d+\.jpg|reference\/preloader|\.contact-sheet/i,
    say: "cite the ground truth by path — a reference slice, the contact sheet — so a relayed evaluator finding can be checked rather than believed",
    cost: "three iterations were spent on judge findings that the reference's own stills contradict or that a sampling artifact invented",
  },
  {
    id: "read-first",
    need: /CLAUDE\.md|PROJECT-LOG|README/i,
    say: "point at what to read first, including the last PROJECT-LOG entry so it inherits prior lessons",
    cost: "agents re-derived context and repeated a fixed mistake",
  },
  {
    id: "ground-truth",
    need: /reference\/slices|Read tool|render as images|\.jpg|\.png|spec/i,
    say: "point at ground truth it cannot derive — reference images, spec files — by path",
    cost: "an agent built from a description of a page instead of the page",
  },
];

/** Metric words that mean something specific to a checker and are ambiguous in English. */
export const METRIC_WORDS = ["density", "detail", "fidelity", "contrast", "chroma", "saturation", "rhythm"];

/**
 * A brief may use a metric word only if it also carries a number — the checker's units, with a
 * current and a target value. "Add density" cost an iteration; "ink coverage is 7.3% against the
 * reference's 25.6%" cannot be misread as a row count.
 */
export function undefinedMetrics(text) {
  const hasNumbers = /\d+(\.\d+)?\s*(%|percentage points|pp\b)/i.test(text) || /\d+\s*\/\s*\d+/.test(text);
  if (hasNumbers) return [];
  return METRIC_WORDS.filter((w) => {
    if (!new RegExp(`\\b${w}\\b`, "i").test(text)) return false;
    // A NAMED STANDARD is an operational definition and needs no numbers. "contrast AA" is exactly
    // as unambiguous as "4.5:1", and flagging it taught the reader that this linter cries wolf —
    // which is how a checker stops being read. Caught by linting a real brief rather than a fixture.
    const named = NAMED_THRESHOLDS[w];
    return !(named && named.test(text));
  });
}

/** Where a word already has a standard that pins it down, the standard counts as the definition. */
export const NAMED_THRESHOLDS = {
  contrast: /\b(AA|AAA|WCAG)\b/,
  saturation: /\bHSL\b/i,
};

export function lint(text) {
  const findings = RULES.filter((r) => !r.need.test(text))
    .map((r) => ({ id: r.id, say: r.say, cost: r.cost }));
  for (const w of undefinedMetrics(text)) {
    findings.push({
      id: `undefined-metric:${w}`,
      say: `"${w}" is measured by a checker but the brief carries no numbers — give it in the checker's units, with current and target values`,
      cost: "'add density' was read as row count; the measured value went down",
    });
  }
  return findings;
}

function selftest() {
  const checks = [];
  const t = (n, c) => checks.push({ n, ok: !!c });

  const good = `
    Working directory: projects/x. Read CLAUDE.md and the last PROJECT-LOG entry first.
    Ground truth: reference/slices/s04.jpg — use the Read tool, they render as images.
    Ink coverage is 7.3% against the reference's 25.6%; edge density 1.9% against 7.1%.
    Run every check SYNCHRONOUSLY in the foreground and read its output. Do not spawn a monitor.
    Give any check that runs longer than two minutes an explicit timeout of up to 600000ms.
    npm run build must pass and npx tsc --noEmit must be clean; then bash run.sh.
    If a change would make the number better and the page worse, it is not a change.
    Never edit a check or its tolerances.
    COMMIT per green unit — the container is reset between turns and an uncommitted tree can vanish.
    DO NOT PUSH. Paste the real command output; a claim with no command output is not accepted.
    State plainly what you did not verify.`;
  t("a complete brief passes", lint(good).length === 0);

  const noEvidence = good.replace(/Ground truth: reference\/slices\/s04\.jpg[^\n]*\n/, "");
  t("FAILS a brief that relays a finding with no ground truth cited", lint(noEvidence).some((f) => f.id === "cite-the-evidence"));

  const noSync = good.replace(/Run every check SYNCHRONOUSLY[^]*?Do not spawn a monitor\./, "");
  t("FAILS a brief with no sync-check clause", lint(noSync).some((f) => f.id === "sync-checks"));

  // The sync clause alone is not enough — proven the hard way, three times.
  const syncButNoTimeout = good.replace(/ Give any check that runs longer than two minutes an explicit timeout of up to 600000ms\./, "");
  t("FAILS 'run it in the foreground' with no timeout budget", lint(syncButNoTimeout).some((f) => f.id === "timeout-budget"));
  t("and still credits the sync clause it does carry", !lint(syncButNoTimeout).some((f) => f.id === "sync-checks"));

  const noGaming = good.replace(/If a change would make[^]*?tolerances\./, "");
  t("FAILS a brief with no anti-gaming clause", lint(noGaming).some((f) => f.id === "no-gaming"));

  const noReason = good.replace(/ — the container is reset between turns and an uncommitted tree can vanish/, "");
  t("FAILS commit-without-the-reason", lint(noReason).some((f) => f.id === "container-resets"));
  t("but still credits the commit clause itself", !lint(noReason).some((f) => f.id === "commit-urgency"));

  const noPush = good.replace(/DO NOT PUSH\. /, "");
  t("FAILS a brief that never forbids pushing", lint(noPush).some((f) => f.id === "no-push"));

  const vague = "Improve the density and detail of the page. Commit per green unit. DO NOT PUSH.";
  const vf = lint(vague);
  t("FAILS an undefined metric word", vf.some((f) => f.id === "undefined-metric:density"));
  t("flags every undefined metric, not just the first", vf.some((f) => f.id === "undefined-metric:detail"));
  t("a vague brief fails on many counts at once", vf.length >= 6);

  const numbered = "Raise ink coverage from 7.3% to 25.6% and edge density from 1.9% to 7.1%.";
  t("PASSES a metric word carrying real numbers", undefinedMetrics(numbered).length === 0);
  t("a ratio counts as numbers too", undefinedMetrics("ground agreement 22/34, needs 26 — detail").length === 0);
  // Found by linting a real brief: "contrast AA" is a named standard, not a vague ask.
  t("PASSES contrast when a WCAG level names the threshold", !undefinedMetrics("focus visible, contrast AA").includes("contrast"));
  t("still FAILS contrast with no threshold at all", undefinedMetrics("improve the contrast").includes("contrast"));
  t("a named threshold does not excuse a different metric", undefinedMetrics("contrast AA and better density").includes("density"));

  t("every rule states what it cost", RULES.every((r) => r.cost && r.cost.length > 20));
  t("every rule says what to do, not just what is missing", RULES.every((r) => /^[a-z]/.test(r.say)));

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.n}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} assertions passed`);
  return failed.length ? 1 : 0;
}

const argv = process.argv.slice(2);
if (argv.includes("--selftest")) process.exit(selftest());
if (!argv[0]) { console.error("usage: lint-brief.mjs <brief.txt> | --selftest"); process.exit(2); }
if (!fs.existsSync(argv[0])) { console.error(`no such file: ${argv[0]}`); process.exit(2); }

const findings = lint(fs.readFileSync(argv[0], "utf8"));
if (!findings.length) {
  console.log("brief carries every clause the register calls for.");
  process.exit(0);
}
console.log(`${findings.length} missing clause(s):\n`);
for (const f of findings) console.log(`  ${f.id}\n    add: ${f.say}\n    why: ${f.cost}\n`);
process.exit(1);
