#!/usr/bin/env node
/**
 * ELIGIBILITY — "can I actually apply to this?", asked before anything is recommended.
 *
 * This exists because ranking on title and location alone recommended a posting that was over a
 * year old, for an intake that had already happened, while its full description sat unread in the
 * same API response. A tool that does not read the posting ends up confidently recommending
 * something you cannot apply to.
 *
 * Every user-specific fact comes from YOUR profile, never from this file:
 *   - intake year          target.timing.intake_year
 *   - graduation year      education[0].graduation_year (or the year of education[0].end)
 *   - where you can work   target.locations + target.countries (+ remote unless target.remote_ok is false)
 *   - work authorisation   target.countries
 *   - events abroad        target.events.require_travel_funding (default true)
 *
 * Design calls:
 *   - LEAN PERMISSIVE: when a rule cannot be determined, keep the item and flag it. Missing a real
 *     opportunity costs more than glancing at one that turns out not to fit.
 *   - events get gated too, on their own terms.
 *
 * Every rule returns "pass" | "fail" | "unknown" with a human reason. Only "fail" excludes.
 * Verdict: eligible (all pass) · check (any unknown) · ineligible (any fail).
 *
 *   node scripts/eligibility.mjs --self-test
 */

import { graduationYear, inRange, intake, loadExample, remoteOk, REMOTE_RE, targetCountries } from "./profile.mjs";

const DAY = 86400000;

/**
 * Feeds that only return PUBLISHED postings, so appearing in one today is proof the posting is open.
 * These ATS board APIs return only active requisitions, so age carries no information about whether
 * applications are accepted. "teamtailor" covers agency boards that publish a JSON feed of their live
 * jobs — agency work is where evergreen requisitions are the norm. This is a DELIBERATE widening of
 * the age rule, and the self-test asserts both directions: teamtailor survives age, an unknown source
 * with the same date still fails.
 */
const LIVE_FEED_SOURCES = new Set(["greenhouse", "lever", "ashby", "teamtailor"]);

const US_TERMS = /^(us|u\.s\.|usa|united states|united states of america|america)$/i;

/** Rules are separate named functions so a wrong verdict can be traced to one, not guessed at. */
export const RULES = {
  /**
   * Freshness — and the reasoning here was WRONG in the first version, in a way that mattered.
   *
   * It failed anything older than 60 days as "past intake", which rejected evergreen internships
   * that were hundreds of days old and still open. Greenhouse, Lever and Ashby board feeds only
   * return ACTIVE postings: a posting in today's live feed is, by definition, one the company is still
   * accepting applications for. `createdAt` records when the req was first opened, not whether it is
   * open now.
   *
   * So age is evidence of NOTHING for a live feed, and the feed itself is the evidence of openness.
   * Age still blocks where the source does NOT guarantee liveness (a scraped listing page can hold a
   * dead posting forever), and an explicitly past deadline always blocks.
   */
  freshness(item, ctx) {
    if (item.deadline_date) {
      const d = new Date(item.deadline_date);
      if (!Number.isNaN(+d)) return d > ctx.now ? ["pass", `closes ${item.deadline_date}`] : ["fail", `deadline passed (${item.deadline_date})`];
    }
    const age = item.posted ? Math.round((ctx.now - new Date(item.posted)) / DAY) : null;
    if (LIVE_FEED_SOURCES.has(item.source))
      return ["pass", age != null && age > ctx.maxAgeDays
        ? `listed in ${item.source}'s live feed today — evergreen requisition, first opened ${age} days ago`
        : `listed in ${item.source}'s live feed today`];
    if (age == null) return ["unknown", "no posting date published"];
    if (Number.isNaN(age)) return ["unknown", "unparseable posting date"];
    if (age > ctx.maxAgeDays) return ["fail", `${age} days old, and this source does not guarantee the listing is still live`];
    return ["pass", `posted ${age} days ago`];
  },

  /** An earlier intake is gone; an unstated year is usually the current cycle, so permissive. */
  intakeYear(item, ctx) {
    if (!ctx.targetYear) return ["unknown", "no intake year in your profile (target.timing.intake_year)"];
    const t = `${item.title} ${item.description || ""}`;
    const years = [...t.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1]));
    if (!years.length) return ["unknown", "no intake year stated"];
    if (years.includes(ctx.targetYear)) return ["pass", `mentions ${ctx.targetYear}`];
    const future = years.filter((y) => y > ctx.targetYear);
    if (future.length) return ["pass", `mentions ${future.join(", ")}`];
    return ["fail", `only mentions ${[...new Set(years)].join(", ")} — earlier intake`];
  },

  /**
   * Year group, from your graduation year against the intake year. Graduating the year after the
   * intake makes you penultimate-year at application; graduating by the intake makes you final-year.
   */
  yearGroup(item, ctx) {
    const t = `${item.title} ${item.description || ""}`.toLowerCase();
    const finalOnly = /\b(final[- ]year|graduating|last year of (your|their) (degree|studies))\b/.test(t) &&
      !/penultimate|any year|all years/.test(t);
    const { gradYear, targetYear } = ctx;
    const known = gradYear && targetYear;
    if (finalOnly) {
      if (!known) return ["unknown", "restricted to final-year / graduating students — add your graduation year to the profile"];
      if (gradYear > targetYear) return ["fail", `restricted to final-year / graduating students — you graduate in ${gradYear}`];
      return ["pass", `final-year scheme — you graduate in ${gradYear}`];
    }
    if (/penultimate/.test(t)) {
      if (!known) return ["unknown", "penultimate-year scheme — add your graduation year to the profile"];
      if (gradYear - targetYear === 1) return ["pass", "penultimate year — eligible"];
      return ["unknown", `penultimate-year scheme, and you graduate in ${gradYear} — check the wording`];
    }
    return ["unknown", "no year-group requirement stated"];
  },

  /** A technical degree covers most technical postings; only an explicit mismatch fails. */
  degree(item) {
    const t = `${item.title} ${item.description || ""}`.toLowerCase();
    if (/\b(computer science|software|engineering|mathematics|maths|physics|informatics|data science|artificial intelligence|machine learning|stem|technical degree|quantitative)\b/.test(t))
      return ["pass", "degree subject matches"];
    if (/\b(law degree|medical degree|nursing|architecture degree|veterinary)\b/.test(t))
      return ["fail", "requires an unrelated degree"];
    return ["unknown", "no degree requirement stated"];
  },

  /**
   * EMPLOYMENT TYPE — a student wants an internship, placement, or contract/casual work, not a
   * permanent senior role. A Vice President posting is not a long shot for a student, it is a role
   * they cannot take, and a board full of them is noise with a bank's name on it.
   *
   * Three answers, not two, because the three cases are genuinely different:
   *
   *   fail     the posting NAMES a seniority a student cannot hold. Definitive, so it is ruled out
   *            and shown in "Ruled out" with this rule named, where a wrong call can be caught.
   *   pass     the posting names an internship, placement, or casual/contract arrangement.
   *   unknown  neither. A bare "Software Engineer" with no wording either way is PROBABLY permanent,
   *            but "probably" is not a reason to delete it, so it lands in "worth a look" carrying
   *            the reason.
   *
   * Deliberately NOT a signal: a stated experience requirement. Whether an experience bar is worth
   * ignoring is your call, and the gap analysis already puts it in front of you.
   */
  employmentType(item, ctx) {
    if ((item.kind || "job") !== "job") return ["pass", "not a job — employment type does not apply"];
    const t = `${item.title} ${item.description || ""}`.toLowerCase();

    // Checked FIRST. "Internal Audit - Associate/Vice President" exists, and a title carrying both an
    // internship word and a seniority word should lose.
    const senior =
      // The `(?:[a-z]+ )?` after "senior" is not decoration: "Private Bank SENIOR INTERNAL AUDITOR"
      // has one qualifier in between, and the first version read straight past it.
      /\b(vice president|executive director|managing director|head of|chief [a-z]+ officer|principal (engineer|scientist|consultant|analyst)|staff (engineer|scientist)|senior (?:[a-z]+ )?(analyst|associate|auditor|engineer|manager|developer|consultant|scientist)|recruiting lead|team lead|tech lead)\b|\bvp\b|\bsvp\b|\bevp\b/;
    const m = senior.exec(t);
    if (m) return ["fail", `"${m[0]}" — a seniority a student${ctx.gradYear ? ` graduating in ${ctx.gradYear}` : ""} cannot hold`];

    if (/\b(intern|internship|placement|industrial (year|placement)|year in industry|summer analyst|spring (week|insight)|insight (day|week|programme|program)|work experience|apprentice(ship)?|trainee|student (role|position|programme|program))\b/.test(t))
      return ["pass", "internship, placement or student programme"];

    if (/\b(contract|fixed[- ]term|temporary|temp role|seasonal|part[- ]time|casual|zero[- ]hours?|bank staff|agency (work|staff)|flexible shifts|shift work|freelance)\b/.test(t))
      return ["pass", "contract, temporary or casual — fits around study"];

    return [
      "unknown",
      "no internship, placement or contract wording — check it is not a permanent full-time role before spending an evening on it",
    ];
  },

  /** Cuts roles that need an authorisation your profile does not list (target.countries). */
  workAuthorisation(item, ctx) {
    const t = `${item.description || ""}`.toLowerCase();
    if (!ctx.usAuthorised && /\b(us citizen|u\.s\. citizen|green card|security clearance|must be authoriz(ed|ation) to work in the (us|united states))\b/.test(t))
      return ["fail", "requires US authorisation or clearance your profile does not list"];
    if (ctx.rtwRe && ctx.rtwRe.test(t)) return ["pass", "right to work in a country your profile lists"];
    if (/\bno visa sponsorship\b/.test(t))
      return ctx.countries.length ? ["pass", "no sponsorship needed — your profile lists your work countries"] : ["unknown", "no visa sponsorship offered — add target.countries to your profile"];
    return ["unknown", "no work-authorisation requirement stated"];
  },

  /** In one of your target locations or countries, or remote. Anything explicitly elsewhere is not. */
  location(item, ctx) {
    const loc = `${item.location || ""}`;
    if (!loc) return ["unknown", "no location given"];
    if (inRange(loc, ctx.profile)) return ["pass", REMOTE_RE.test(loc) && ctx.remoteOk ? "remote" : item.location];
    if (!ctx.hasPlaces) return ["unknown", "no target locations in your profile (target.locations / target.countries)"];
    return ["fail", `${item.location} — outside your target locations`];
  },

  stillOpen(item) {
    const t = `${item.title} ${item.description || ""}`.toLowerCase();
    if (/\b(closed|no longer accepting|applications have closed|position filled|paused)\b/.test(t))
      return ["fail", "marked closed"];
    return ["pass", "no closure signal"];
  },

  notAlreadyApplied(item, ctx) {
    if (ctx.appliedUrls?.has(item.url)) return ["fail", "already in the application tracker"];
    return ["pass", "not yet applied"];
  },
};

/** Events are gated on their own terms — a talk has no degree requirement, but it can be sold out. */
export const EVENT_RULES = {
  freshness: RULES.freshness,

  /**
   * An event abroad is a TRAVEL decision, not an eligibility one. The job rule is right for jobs — a
   * role abroad needs work authorisation — but a hackathon abroad needs a flight, and some publish
   * travel grants for exactly this. Running the job rule over events marks every foreign event
   * "ineligible", which is a wrong answer rather than a filter.
   *
   * It is not free either, and a list of seventy foreign events you are never going to fly to is
   * wallpaper, not a shortlist. So the test is FUNDING, because funding is the half that is
   * objectively checkable:
   *
   *   funded    the posting says travel, flights or accommodation are covered → unknown, kept for a look.
   *   not       → fail, shown under "Ruled out" with this rule named, unless your profile sets
   *             target.events.require_travel_funding to false, in which case it is kept for a look.
   *
   * Whether an event is worth the trip is a judgement, and pretending a regex can make it would be
   * worse than leaving it to the person who has to get on the plane.
   */
  location(item, ctx) {
    const [status, reason] = RULES.location(item, ctx);
    if (status !== "fail") return [status, reason];
    const t = `${item.title} ${item.description || ""}`;
    const funded =
      /\b(travel (grant|grants|reimbursement|stipend|bursary|support|covered|reimbursed)|reimburse[sd]? (your )?travel|travel expenses|expenses (are )?(covered|paid|reimbursed)|flights? (covered|paid|provided|reimbursed)|accommodation (provided|covered|paid|included)|fully funded|all expenses paid|hotel (provided|covered))\b/i;
    if (funded.test(t))
      return ["unknown", `${item.location} — travel looks funded. Whether it is worth the trip is yours to judge.`];
    if (!ctx.requireTravelFunding)
      return ["unknown", `${item.location} — outside your target locations, and no travel funding mentioned. Kept because your profile does not require funding.`];
    return [
      "fail",
      `${item.location} — outside your target locations and the posting mentions no travel funding. If they do fund travel, say so and it comes back.`,
    ];
  },
  stillOpen(item) {
    const t = `${item.title} ${item.description || ""}`.toLowerCase();
    if (/\b(sold out|registration closed|event has ended|cancelled|canceled)\b/.test(t))
      return ["fail", "sold out or closed"];
    return ["pass", "open"];
  },
  notAlreadyApplied: RULES.notAlreadyApplied,
};

/** Everything the rules read from the profile, computed once per assessment. */
export function contextFor(profile, opts = {}) {
  const p = profile || {};
  const countries = targetCountries(p).map((c) => String(c).trim()).filter(Boolean);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alt = countries.map((c) => esc(c.toLowerCase())).join("|");
  return {
    profile: p,
    now: opts.now ? new Date(opts.now) : new Date(),
    targetYear: opts.targetYear ?? intake(p).year,
    gradYear: graduationYear(p),
    maxAgeDays: opts.maxAgeDays ?? 60,
    countries,
    usAuthorised: countries.some((c) => US_TERMS.test(c)),
    rtwRe: alt ? new RegExp(`\\b(right to work in (the )?(${alt})|(${alt}) work authori[sz]ation)\\b`, "i") : null,
    hasPlaces: Boolean((p.target?.locations || []).length || countries.length),
    remoteOk: remoteOk(p),
    requireTravelFunding: p.target?.events?.require_travel_funding !== false,
    appliedUrls: opts.appliedUrls ?? new Set(),
  };
}

/** assess(item, { profile, now?, appliedUrls? }) — the profile is required for any real verdict. */
export function assess(item, opts = {}) {
  const ctx = contextFor(opts.profile, opts);
  const isEvent = (item.kind || "job") !== "job";
  const rules = isEvent ? EVENT_RULES : RULES;

  const checks = {};
  for (const [name, fn] of Object.entries(rules)) {
    const [status, reason] = fn(item, ctx);
    checks[name] = { status, reason };
  }
  const fails = Object.entries(checks).filter(([, c]) => c.status === "fail");
  const unknowns = Object.entries(checks).filter(([, c]) => c.status === "unknown");

  // PERMISSIVE by design: unknowns never exclude, they surface for a human glance.
  const verdict = fails.length ? "ineligible" : unknowns.length ? "check" : "eligible";
  return {
    verdict,
    checks,
    blockers: fails.map(([n, c]) => `${n}: ${c.reason}`),
    unclear: unknowns.map(([n, c]) => `${n}: ${c.reason}`),
  };
}

// ---------------------------------------------------------------- self-test
// Every rule proven to FAIL on the input it exists to catch, and to PASS on a good one. A gate only
// ever shown passing is not a gate. Run against the FICTIONAL example profile, so the cases below are
// built from its values (home city, intake year) rather than anyone's real ones.
function selfTest() {
  const profile = loadExample();
  const year = intake(profile).year; // the example's intake year
  const city = profile.target.locations[0];
  const now = `${year - 1}-08-08`;
  const recent = `${year - 1}-08-01`;
  const good = {
    kind: "job",
    title: `Software Engineer Intern, Summer ${year}`,
    location: `${city}, United Kingdom`,
    posted: recent,
    description: "Open to penultimate year students studying computer science. Right to work in the UK required.",
    url: "https://example.com/good",
  };
  const cases = [
    ["good posting is eligible", good, {}, "eligible"],
    [
      "a stale posting from a source that cannot vouch for liveness is caught",
      { ...good, source: "scraped-listing-page", posted: `${year - 2}-06-26`, description: "Software engineer internship." },
      {},
      "ineligible",
    ],
    ["an earlier intake is caught", { ...good, title: `SWE Intern Summer ${year - 1}`, description: `For summer ${year - 1}.` }, {}, "ineligible"],
    [
      "final-year-only is caught",
      { ...good, description: `Open to final year students graduating in ${year} only.` },
      {},
      "ineligible",
    ],
    ["outside your target locations is caught", { ...good, location: "New York, United States" }, {}, "ineligible"],
    [
      "US clearance requirement is caught",
      { ...good, description: `Must be a US citizen with security clearance. Summer ${year}.` },
      {},
      "ineligible",
    ],
    ["a closed posting is caught", { ...good, description: `Summer ${year}. Applications have closed.` }, {}, "ineligible"],
    [
      "an already-applied role is caught",
      good,
      { appliedUrls: new Set(["https://example.com/good"]) },
      "ineligible",
    ],
    [
      "an evergreen ATS posting is NOT rejected for age — the live feed is proof it is open",
      { ...good, source: "lever", posted: `${year - 6}-06-26`, description: "Software engineer internship." },
      {},
      "check",
    ],
    [
      "age STILL blocks where the source cannot vouch the listing is live",
      { ...good, source: "scraped-listing-page", posted: `${year - 6}-06-26`, description: "Software engineer internship." },
      {},
      "ineligible",
    ],
    // The Teamtailor pair. Asserting only the pass would prove the allowance exists, not that the age
    // rule is still a gate.
    [
      "a Teamtailor board posting is NOT rejected for age — its feed only publishes open jobs",
      { ...good, source: "teamtailor", posted: `${year - 1}-05-14`, description: "Bar staff. Flexible shifts." },
      {},
      "check",
    ],
    [
      "the SAME posting from an unnamed source at the SAME age is still ruled out",
      { ...good, source: "some-agency-website", posted: `${year - 1}-05-14`, description: "Bar staff. Flexible shifts." },
      {},
      "ineligible",
    ],
    // EMPLOYMENT TYPE. Titles in the shape real boards carry them, so the rule is proven against the
    // thing it exists to catch.
    [
      "a Vice President role is ruled out",
      { ...good, title: "International ALM Risk Manager - Vice President", description: "Permanent role in London." },
      {},
      "ineligible",
    ],
    [
      "an Executive Director role is ruled out",
      { ...good, title: "International Private Bank, Executive Director, EMEA Sponsors Lending & Fund Finance", description: "London." },
      {},
      "ineligible",
    ],
    [
      "a Senior Auditor role is ruled out",
      { ...good, title: "Private Bank Senior Internal Auditor", description: "London." },
      {},
      "ineligible",
    ],
    [
      "a Recruiting Lead is ruled out",
      { ...good, title: "Recruiting Lead, International Consumer Banking – Revenue", description: "London." },
      {},
      "ineligible",
    ],
    // The other direction, which is the half that matters: the rule must not eat what you want.
    ["an internship is NOT ruled out by the employment-type rule", good, {}, "eligible"],
    [
      "casual bar work is NOT ruled out — it is exactly what fits around study",
      { kind: "job", title: `Event Bar Staff — ${city}`, location: `${city}, United Kingdom`, source: "teamtailor",
        description: "Flexible shifts: you choose when and where you work. Competitive hourly rates, paid weekly.", url: "https://example.com/bar" },
      {},
      "check",
    ],
    [
      "a seniority word BEATS an internship word in the same posting",
      { ...good, title: "Internal Audit Internship - Associate/Vice President", description: `Summer ${year} internship.` },
      {},
      "ineligible",
    ],
    [
      "a bare job title with no wording either way is kept for review, not deleted",
      { kind: "job", title: "Software Engineer", location: "London, UK", posted: recent,
        description: "Build systems at scale. Right to work in the UK required.", url: "https://example.com/bare" },
      {},
      "check",
    ],
    [
      "an explicitly passed deadline always blocks, however fresh the source",
      { ...good, source: "lever", deadline_date: `${year - 1}-07-01` },
      {},
      "ineligible",
    ],
    [
      "PERMISSIVE: a thin posting is kept for review, not dropped",
      { kind: "job", title: "Software Engineer Intern", location: "London, UK", posted: recent, url: "https://example.com/thin" },
      {},
      "check",
    ],
    [
      "an event is gated on its own terms, not a degree requirement",
      { kind: "event", title: "AI evening with two local start-ups", location: city, posted: `${year - 1}-08-05`, url: "https://example.com/ev" },
      {},
      "eligible",
    ],
    [
      "a sold-out event is caught",
      { kind: "event", title: "AI meetup", location: city, posted: `${year - 1}-08-05`, description: "Sold out.", url: "https://example.com/ev2" },
      {},
      "ineligible",
    ],
    // The pair that matters: the SAME foreign location is a hard blocker for a job and a travel
    // decision for a hackathon. Funded vs not — same country, opposite answers.
    [
      "a FUNDED hackathon abroad is kept — travel is covered",
      { kind: "hackathon", title: `Junction ${year - 1}`, location: "Helsinki, Finland", posted: `${year - 1}-08-05`,
        description: "48 hours of building. Travel grants available for international participants.", url: "https://example.com/hk" },
      {},
      "check",
    ],
    [
      "an UNFUNDED hackathon abroad is ruled out — a list of flights you will never take is not a shortlist",
      { kind: "hackathon", title: "Example Hackathon", location: "Houston, Texas", posted: `${year - 1}-08-05`, description: "36 hours.", url: "https://example.com/hr" },
      {},
      "ineligible",
    ],
    [
      "...unless the profile says travel funding is not required",
      { kind: "hackathon", title: "Example Hackathon", location: "Houston, Texas", posted: `${year - 1}-08-05`, description: "36 hours.", url: "https://example.com/hr2" },
      { profile: { ...profile, target: { ...profile.target, events: { require_travel_funding: false } } } },
      "check",
    ],
    [
      "an event in a target country is unaffected by the funding bar",
      { kind: "hackathon", title: "DurHack", location: "Durham, United Kingdom", posted: `${year - 1}-08-05`, description: "24 hours.", url: "https://example.com/dh" },
      {},
      "eligible",
    ],
    [
      "the same foreign location IS a blocker for a job",
      { kind: "job", title: "Software Engineer Intern", location: "Helsinki, Finland", posted: `${year - 1}-08-05`, description: `Internship for ${year}.`, url: "https://example.com/jb" },
      {},
      "ineligible",
    ],
    // GENERIC, both ways: the same posting reads differently for a different person, because every
    // personal value comes from the profile. A US-authorised profile is not blocked by a US-only role,
    // and a profile that graduates in the intake year IS eligible for a final-year scheme.
    [
      "a US-only role is NOT blocked for a profile that lists the US",
      { ...good, location: "New York, United States", description: `Must be authorized to work in the United States. Summer ${year}.` },
      { profile: { ...profile, target: { ...profile.target, locations: ["New York"], countries: ["United States", "US"] } } },
      "check",
    ],
    [
      "a final-year scheme is open to a profile graduating in the intake year",
      { ...good, description: `Open to final year students graduating in ${year} only. Right to work in the UK required.` },
      { profile: { ...profile, education: [{ ...profile.education[0], graduation_year: year, end: `${year}-06` }] } },
      "eligible",
    ],
  ];

  let failed = 0;
  for (const [name, item, opts, expect] of cases) {
    const r = assess(item, { now, profile, ...opts });
    const ok = r.verdict === expect;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name} → ${r.verdict}${ok ? "" : ` (expected ${expect}) ${JSON.stringify(r.blockers)} ${JSON.stringify(r.unclear)}`}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED (${failed})` : `\nself-test passed — ${cases.length} cases, every rule proven to fail on the input it exists to catch`);
  process.exit(failed ? 1 : 0);
}

// Only when this file is the entry point: a bare argv check also fires when another script
// imports this module with --self-test on the command line, which silently replaced that
// script's own self-test with this one.
if (process.argv[1] && process.argv[1].endsWith("eligibility.mjs") && process.argv.includes("--self-test")) selfTest();
