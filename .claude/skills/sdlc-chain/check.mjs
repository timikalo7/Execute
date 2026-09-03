#!/usr/bin/env node
/**
 * sdlc-chain — does this project's work leave the artifact trail the AI-native SDLC calls for?
 *
 * From Anthropic's Applied AI team, "The AI-Native SDLC playbook" (claude.com/blog), surfaced by
 * reel DcllA-5oW0w. Verified against the primary source rather than the reel, because the reel got
 * the stages wrong — it showed five (Plan / Build / Review / Deploy / Operate) where the playbook
 * has SIX (Plan / Design / Build / Test / Deploy / Maintain), and it omitted the part that makes it
 * a loop: Maintain emits a NEW intent from monitoring, so the chain feeds itself.
 *
 * The premise: code is no longer the bottleneck, so the constraint moved to planning, review and
 * deployment. The mechanism: every stage commits an artifact, each handoff is a git commit, and
 * the chain doubles as the audit trail.
 *
 * Execute already had most of the artifacts and NONE of the enforcement — a project could be built
 * with no spec and no plan and nothing anywhere would notice. This is the enforcement.
 *
 *   node check.mjs <project-dir> [--enforce]
 *   node check.mjs --all
 *   node check.mjs --selftest
 *
 * Exit 0 = chain intact (or advisory mode). Exit 1 = a stage is missing under --enforce.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * The six stages, with the playbook's canonical filename first and Execute's existing conventions
 * as accepted aliases.
 *
 * Aliases are not a fudge, they are the only way this lands: Execute has been writing
 * `Requirements.md` and `Proposed Plan.md` for months, and a checker that declares every existing
 * project broken on day one gets switched off on day two. The canonical name is what new work
 * should use; the alias is what old work already has.
 */
export const STAGES = [
  { id: "plan",     canonical: "intent.md", aliases: ["Raw Idea.md", "Discovery.md", "IDEA.md"],
    asks: "what are we doing and why" },
  { id: "design",   canonical: "spec.md",   aliases: ["Requirements.md", "Technical Spec.md", "SPEC.md"],
    asks: "what exactly must be true when it is done" },
  { id: "build",    canonical: "plan.md",   aliases: ["Proposed Plan.md", "PLAN.md", "ROADMAP.md"],
    asks: "in what order, and what depends on what" },
  { id: "test",     canonical: "VERIFICATION.md", aliases: ["scripts/journey.mjs", "PROJECT-LOG.md"],
    asks: "what was actually run, and what did it output" },
  { id: "deploy",   canonical: "LAUNCH-CHECKLIST.md", aliases: ["STATUS.md", "HANDOVER.md"],
    asks: "what had to be true before it went out" },
  { id: "maintain", canonical: "INCIDENTS.md", aliases: ["watchdog.json", "PROJECT-LOG.md"],
    asks: "what has gone wrong since, and what new intent did it produce" },
];

/**
 * The chain is split across TWO folders by Execute's own convention, and the first version of this
 * checker did not know that: `potential-projects/<name>/` holds the planning artifacts (Raw Idea,
 * Research, Proposed Plan, Requirements, Technical Spec) and `projects/<name>/` holds the running
 * thing. Looking only in `projects/` reported all ten as broken — a false alarm produced by the
 * checker modelling the repo wrongly, caught by going and looking before reporting the number.
 */
export function searchDirs(dir) {
  const base = path.basename(dir);
  const parent = path.dirname(path.dirname(dir));
  return [dir, path.join(parent, "potential-projects", base)];
}

export function findArtifact(dir, stage, exists = (p) => fs.existsSync(p)) {
  const names = [stage.canonical, ...stage.aliases];
  for (const d of searchDirs(dir)) {
    for (const n of names) {
      if (exists(path.join(d, n))) {
        return { name: n, dir: d, canonical: n === stage.canonical, staged: d !== dir };
      }
    }
  }
  return null;
}

/** Is the file tracked by git? An artifact that only exists locally is not an audit trail. */
export function isCommitted(repoRoot, file, run = defaultRun) {
  try {
    const out = run("git", ["-C", repoRoot, "ls-files", "--error-unmatch", file]);
    return String(out).trim().length > 0;
  } catch {
    return false;
  }
}

function defaultRun(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function checkChain(dir, { repoRoot = ".", exists, run } = {}) {
  const rows = [];
  for (const stage of STAGES) {
    const found = findArtifact(dir, stage, exists);
    rows.push({
      stage: stage.id,
      asks: stage.asks,
      canonical: stage.canonical,
      artifact: found?.name ?? null,
      usingCanonical: !!found?.canonical,
      staged: !!found?.staged,
      committed: found ? isCommitted(repoRoot, path.join(found.dir, found.name), run) : false,
    });
  }
  const missing = rows.filter((r) => !r.artifact);
  const uncommitted = rows.filter((r) => r.artifact && !r.committed);
  return { rows, missing, uncommitted, intact: missing.length === 0 && uncommitted.length === 0 };
}

/* --------------------------------------------------------------------------- selftest */

function selfTest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };

  const mk = (files) => (p) => files.includes(path.basename(p)) || files.includes(p.replace(/^proj\//, ""));
  const allCommitted = () => "tracked";
  const noneCommitted = () => { throw new Error("untracked"); };

  check(STAGES.length === 6,
    `the playbook has SIX stages, not the reel's five (found ${STAGES.length})`);
  check(STAGES.map((s) => s.id).join(",") === "plan,design,build,test,deploy,maintain",
    "stages are in the playbook's order");
  check(STAGES.at(-1).id === "maintain" && /new intent/.test(STAGES.at(-1).asks),
    "the last stage closes the loop by producing a new intent");

  // a complete chain, canonical names
  const full = ["intent.md", "spec.md", "plan.md", "VERIFICATION.md", "LAUNCH-CHECKLIST.md", "INCIDENTS.md"];
  let r = checkChain("proj", { exists: mk(full), run: allCommitted });
  check(r.intact, "a complete, committed chain is intact");
  check(r.rows.every((x) => x.usingCanonical), "canonical names are recognised as canonical");

  // Execute's existing filenames must NOT read as a broken project
  const legacy = ["Raw Idea.md", "Requirements.md", "Proposed Plan.md", "PROJECT-LOG.md", "STATUS.md", "watchdog.json"];
  r = checkChain("proj", { exists: mk(legacy), run: allCommitted });
  check(r.intact, "an existing Execute project satisfies the chain through its aliases");
  check(r.rows.every((x) => !x.usingCanonical), "aliases are reported as aliases, not as canonical");

  // a missing middle stage is caught and NAMED
  const gappy = ["intent.md", "plan.md", "PROJECT-LOG.md", "STATUS.md", "INCIDENTS.md"];
  r = checkChain("proj", { exists: mk(gappy), run: allCommitted });
  check(!r.intact, "a chain with no spec is NOT intact");
  check(r.missing.length === 1 && r.missing[0].stage === "design",
    `the missing stage is named (got ${r.missing.map((m) => m.stage).join(",") || "none"})`);

  // an artifact that exists but is not committed is not an audit trail
  r = checkChain("proj", { exists: mk(full), run: noneCommitted });
  check(!r.intact, "an uncommitted chain is NOT intact — a local file is not an audit trail");
  check(r.uncommitted.length === 6, "every uncommitted artifact is reported, not just the first");

  // the split-folder convention: planning artifacts live in potential-projects/<name>/
  const split = (p) => ["projects/x/PROJECT-LOG.md", "projects/x/STATUS.md",
    "potential-projects/x/Raw Idea.md", "potential-projects/x/Requirements.md",
    "potential-projects/x/Proposed Plan.md"].includes(p);
  r = checkChain("repo/projects/x", { exists: (p) => split(p.replace(/^repo\//, "")), run: allCommitted });
  check(r.intact, "planning artifacts in potential-projects/ satisfy the chain — they are not missing, they are staged");
  check(r.rows.filter((x) => x.staged).length === 3, "staged artifacts are reported as staged");

  // empty project
  r = checkChain("proj", { exists: () => false, run: allCommitted });
  check(r.missing.length === 6 && !r.intact, "a project with no artifacts fails every stage");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — sdlc-chain: ${pass} passed, ${fail} failed`);
  return fail;
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selfTest() ? 1 : 0);

  const enforce = argv.includes("--enforce");
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const targets = argv.includes("--all")
    ? fs.readdirSync(path.join(root, "projects"), { withFileTypes: true })
        .filter((d) => d.isDirectory()).map((d) => path.join("projects", d.name))
    : [argv.find((a) => !a.startsWith("--"))].filter(Boolean);

  if (!targets.length) {
    console.error("usage: check.mjs <project-dir> [--enforce] | --all | --selftest");
    process.exit(2);
  }

  /*
   * THE RATCHET, same shape as the warning and debt budgets. Ten existing projects were built
   * before this chain existed, and flipping --enforce on all of them would fail every push
   * tomorrow — so the gate would be switched off, which is worse than not having it. Instead the
   * known-broken set is baselined: a project on the list is reported and not blocked, a project NOT
   * on the list must have an intact chain. A new project therefore cannot skip planning, and the
   * list can only ever shrink.
   */
  const BASELINE = path.join(path.dirname(new URL(import.meta.url).pathname), "chain-baseline.json");
  let baseline = { grandfathered: [] };
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")); } catch { /* first run */ }
  const grandfathered = new Set(baseline.grandfathered || []);

  let broken = 0, blocking = 0, healed = [];
  for (const t of targets) {
    const { rows, missing, uncommitted, intact } = checkChain(path.join(root, t), { repoRoot: root });
    console.log(`\nsdlc-chain — ${t}`);
    for (const r of rows) {
      const mark = !r.artifact ? "MISSING " : !r.committed ? "UNCOMMIT" : r.usingCanonical ? "ok      " : "alias   ";
      const where = r.staged ? " (staged)" : "";
      console.log(`  ${mark} ${r.stage.padEnd(9)} ${(r.artifact ?? r.canonical).padEnd(22)}${where} — ${r.asks}`);
    }
    const name = path.basename(t);
    if (!intact) {
      broken++;
      if (missing.length) console.log(`  → no artifact for: ${missing.map((m) => `${m.stage} (${m.canonical})`).join(", ")}`);
      if (uncommitted.length) console.log(`  → not committed: ${uncommitted.map((u) => u.artifact).join(", ")}`);
      if (grandfathered.has(name)) {
        console.log(`  → grandfathered: built before this chain existed, reported but not blocking.`);
      } else {
        blocking++;
        console.log(`  → NOT grandfathered — a project starting now writes its intent, spec and plan first.`);
      }
    } else if (grandfathered.has(name)) {
      healed.push(name);
    }
  }

  // A healed project leaves the list permanently. The baseline only shrinks.
  if (healed.length) {
    baseline.grandfathered = (baseline.grandfathered || []).filter((n) => !healed.includes(n));
    fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`\nBASELINE RATCHETED DOWN — chain now intact, removed permanently: ${healed.join(", ")}`);
  }

  console.log(
    broken === 0
      ? `\nRESULT: pass — every chain intact.`
      : blocking === 0
        ? `\nRESULT: pass — ${broken} project(s) with a broken chain, all grandfathered. New projects must comply.`
        : `\nRESULT: FAIL — ${blocking} project(s) not grandfathered and missing chain artifacts.`,
  );
  process.exit(blocking ? 1 : 0);
}
