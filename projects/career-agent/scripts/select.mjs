#!/usr/bin/env node
/**
 * SELECTION — deciding which true things go on the page, and in what order.
 *
 * Split out of tailor.mjs because two renderers need identical answers: the markdown the dashboard
 * shows inline, and the HTML that becomes the PDF you actually upload. If those two ranked entries
 * differently, the CV on screen would not be the CV in the file — a difference nobody would notice
 * until an interviewer asked about a line that was not there.
 *
 * Nothing here writes a claim. It only picks and orders strings that already exist in the profile.
 */

/** Every skill the profile actually claims, flattened once. */
export function profileSkills(profile) {
  const out = new Set();
  for (const [group, list] of Object.entries(profile.skills || {})) {
    if (group.startsWith("_") || !Array.isArray(list)) continue;
    for (const s of list) if (s?.name) out.add(s.name);
  }
  for (const e of [...(profile.experience || []), ...(profile.projects || []), ...(profile.leadership || [])])
    for (const a of e.achievements || []) for (const s of a.skills || []) out.add(s);
  return [...out];
}

/**
 * Does this text name that skill — as a word, not as a run of letters?
 *
 * Plain `includes()` was catastrophic here and the damage was invisible. A profile that claims "C"
 * or "Go" matched every posting that contained the letter "c" or the word "going", every entry was
 * scored as answering them, and the CV ordering became noise wearing the shape of a match.
 *
 * The boundary excludes `+ # .` as well as letters and digits so "C" does not match "C++", ".NET"
 * does not match "NET", and "Go" does not match "Google". Compound profile names like
 * "Java / Kotlin" are tried as each alternative.
 */
export function hasTerm(text, term) {
  const hay = String(text || "");
  for (const alt of String(term).split("/").map((s) => s.trim()).filter(Boolean)) {
    const esc = alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![A-Za-z0-9+#.])${esc}(?![A-Za-z0-9+#.])`, "i").test(hay)) return true;
  }
  return false;
}

/** How well one achievement answers this particular posting. */
export function relevance(achievement, wanted) {
  const hay = `${achievement.claim} ${(achievement.skills || []).join(" ")}`;
  let n = 0;
  for (const w of wanted) if (hasTerm(hay, w)) n += 2;
  return n;
}

/** Which of the profile's skills the posting explicitly asks for, and which it asks for that we lack. */
export function matchSkills(profile, description) {
  const text = description || "";
  const mine = profileSkills(profile);
  const have = mine.filter((s) => hasTerm(text, s));
  // A short list of things postings commonly require that the profile may not claim. Deliberately
  // small and explicit rather than an open-ended guess at "everything in the world we don't know".
  const COMMON = ["C++", "Rust", "Scala", "Kotlin", "Swift", "Terraform", "Kafka", "Spark", "Hadoop",
    "GraphQL", "Redis", "Kubernetes", "Ruby", "PHP", ".NET", "Azure", "GCP", "Tableau", "SAS"];
  const missing = COMMON.filter((c) => hasTerm(text, c) && !mine.some((s) => s.toLowerCase() === c.toLowerCase()));
  return { have, missing };
}

/**
 * Words that are in a profile as skills but are worthless as a MATCH signal, because every job
 * description on earth contains them. "Communication" appearing in an infrastructure posting is not a
 * named requirement, and treating it as one pulls a mentoring achievement to the top of an
 * infrastructure application. A match has to mean something specific or it is noise with a name.
 */
const SOFT_TERMS = new Set(
  ["communication", "leadership", "teaching", "mentoring", "outreach", "founding", "events",
    "product thinking", "rapid prototyping", "full-stack", "responsive design", "agile",
    "technical documentation", "data structures"].map((s) => s.toLowerCase()),
);

export const isTechnical = (name) => !SOFT_TERMS.has(String(name).toLowerCase());

/**
 * The keywords this posting is ranked against — its own, or, for a thin posting that names nothing
 * the profile claims, the user's own `target.boost_keywords`.
 */
export function wantedFor(profile, item) {
  const { have } = matchSkills(profile, item.description);
  const technical = have.filter(isTechnical);
  if (technical.length) return technical;
  const boost = (profile.target?.boost_keywords || []).filter(Boolean);
  return boost.length ? boost : ["python", "java", "typescript", "cloud"];
}

/**
 * Entries, best-answering-this-posting first.
 *
 * Relevance decides the order. Where two entries answer the posting equally well — which happens
 * constantly, because most postings name few enough technologies that several entries score zero —
 * `cv_weight` from the profile breaks the tie. Without it, ties fell back to the order entries happen
 * to sit in the JSON, and a weak side job could open a CV above the strongest work. That is ordering
 * metadata, not a claim: it changes which true thing is read first, never what is said.
 */
export function rank(entries, wanted) {
  return (entries || [])
    .map((e) => ({ e, r: Math.max(0, ...(e.achievements || []).map((a) => relevance(a, wanted))) }))
    .sort((a, b) => b.r - a.r || (b.e.cv_weight ?? 0) - (a.e.cv_weight ?? 0))
    .map((x) => x.e);
}

export function bestAchievements(entry, wanted, n = 2) {
  return [...(entry.achievements || [])].sort((a, b) => relevance(b, wanted) - relevance(a, wanted)).slice(0, n);
}

/**
 * Self-test for the term matcher, because the bug it fixes was silent: nothing crashed, no check
 * failed, the CV just quietly ranked the wrong job first. Every case below is a string shape that the
 * old `includes()` version got wrong.
 */
function selfTest() {
  const cases = [
    ["C", "Experience with C and low-level systems", true],
    ["C", "We work across a broad technical surface", false],
    ["C", "Strong C++ background required", false],
    ["Go", "Services are written in Go and Rust", true],
    ["Go", "You will be going to work with Google Cloud", false],
    ["ROS", "ROS2 experience is a plus", false],
    ["ROS", "Built across ROS and Gazebo", true],
    [".NET", "A .NET shop", true],
    [".NET", "connect to the NET namespace", false],
    ["Java / Kotlin", "We use Kotlin everywhere", true],
    ["Kubernetes", "Docker and Kubernetes in production", true],
    ["Kubernetes", "container orchestration", false],
  ];
  let failed = 0;
  for (const [term, text, expect] of cases) {
    const got = hasTerm(text, term);
    const ok = got === expect;
    console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(term)} in ${JSON.stringify(text)} → ${got}`);
    if (!ok) failed++;
  }
  console.log(
    failed
      ? `\nself-test FAILED (${failed})`
      : `\nself-test passed — ${cases.length} cases, the matcher rejects substrings it used to accept`,
  );
  process.exit(failed ? 1 : 0);
}

// Only when this file is the entry point: a bare argv check also fires when another script
// imports this module with --self-test on the command line, which silently replaced that
// script's own self-test with this one.
if (process.argv[1] && process.argv[1].endsWith("select.mjs") && process.argv.includes("--self-test")) selfTest();

/** "2026-06" → "Jun 2026"; "present" stays "present"; a bare year stays a bare year. */
export function period(start, end) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const one = (s) => {
    if (!s) return "";
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    return m ? `${MON[Number(m[2]) - 1]} ${m[1]}` : s;
  };
  const a = one(start);
  const b = one(end);
  return !b || b === a ? a : `${a} – ${b}`;
}
