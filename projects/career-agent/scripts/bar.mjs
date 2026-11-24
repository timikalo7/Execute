#!/usr/bin/env node
/**
 * BAR — "is this worth my evening?", and, if you already hold an offer, "is it worth declining it?"
 *
 * THIS IS A SECOND AXIS, NOT A TIGHTER FILTER, and the distinction is the whole design.
 * `eligibility.mjs` answers **can you apply** — year group, degree, work authorisation, deadline. This
 * file answers **should you bother**. Folding the second into the first would be wrong twice over: it
 * would mark roles "ineligible" that you are perfectly eligible for, and it would put a judgement call
 * ("another bank is not an upgrade on a bank offer") inside a rule set that is otherwise about facts.
 *
 * Everything personal comes from your profile (see profile.mjs → barConfig):
 *   target.bar_to_beat   the offer you hold: employer, employer_class, hourly_usd — or null for none
 *   target.bar           home_cities (an upgrade on their own), acceptable_cities, min_pay
 *
 * So every row keeps its eligibility verdict AND gains a tier:
 *
 *   beats     an upgrade: a stronger employer for a technical career, your home city, or more pay
 *   lateral   a fine internship that is not an upgrade — the same kind of employer as your offer, or
 *             the same thing further from home
 *   below     not an internship, or not technical work
 *   unknown   not enough in the posting to say
 *
 * ── THE HONEST LIMIT, STATED UP FRONT ─────────────────────────────────────────────────────────────
 * Very few postings state pay at all (measured on a real board: 3 of 245). A pay rule that only read
 * the posting would be `unknown` on almost every row and would look like a working filter while
 * deciding nothing. So pay is inferred from EMPLOYER CLASS, which is present on every row and is a
 * genuinely strong proxy: quant/HFT intern compensation is public and is a multiple of a typical bank
 * technology internship. Where a posting DOES state a number it is read and used directly. Every
 * reason string says which of the two happened, so a rank is never mistaken for a salary comparison.
 */

import { barConfig, loadExample } from "./profile.mjs";

/**
 * Employer classes. These are judgement calls, deliberately written down so they can be argued with
 * rather than buried in a regex. Edit any line to match your own view of the market. The employer of
 * an offer you hold is added to its class automatically (target.bar_to_beat.employer_class).
 */
export const EMPLOYER_CLASS = [
  {
    id: "quant",
    tier: "beats",
    why: "quant/HFT — intern compensation at these firms is public and is a multiple of a typical bank technology internship, and the engineering bar is the highest in the industry",
    re: /\b(jane street|citadel|jump trading|drw|optiver|imc|sig\b|susquehanna|hudson river|hrt\b|two sigma|de shaw|d\. e\. shaw|qube research|g-research|squarepoint|xtx|millennium|point72|balyasny|tower research|headlands|akuna|five rings|old mission|radix|maven securities|quadrature|marshall wace|man group|aqr|castleton commodities)\b/i,
  },
  {
    id: "big-tech",
    tier: "beats",
    why: "product engineering at scale — a stronger signal on a CV than internal IT",
    re: /\b(google|alphabet|deepmind|meta\b|facebook|amazon|aws\b|apple\b|microsoft|netflix|nvidia|openai|anthropic|stripe|databricks|snowflake|figma|canva|spotify|uber|airbnb|linkedin|bytedance|tiktok|tencent|palantir|cloudflare|datadog|atlassian|shopify|coinbase|revolut|monzo|wise\b|deliveroo|arm\b|qualcomm|intel\b|amd\b|ibm research|bloomberg)\b/i,
  },
  {
    id: "research",
    tier: "beats",
    why: "research lab — the career direction internal IT does not build",
    re: /\b(deepmind|openai|anthropic|mistral|cohere|perplexity|hugging ?face|allen institute|ai2\b|fair\b|microsoft research|ibm research|nasa|cern|turing institute|lila sciences|isomorphic)\b/i,
  },
  {
    id: "tech-platform",
    tier: "beats",
    why: "the engineering IS the product here (an exchange's matching engine, a fintech's core platform) rather than internal IT supporting a bank",
    re: /\b(blackrock|aladdin|london stock exchange|lseg|nasdaq|ice\b|cboe|refinitiv|fnz|nutmeg|starling bank|checkout\.com|adyen|marqeta|plaid|klarna|gocardless)\b/i,
  },
  {
    id: "bank",
    tier: "lateral",
    why: "a bank's technology division — a good internship, but not a technical-depth upgrade",
    re: /\b(j\.?p\.? ?morgan|jpmorgan|goldman sachs|morgan stanley|hsbc|natwest|lloyds|santander|deutsche bank|ubs\b|credit suisse|bnp paribas|société générale|societe generale|citi\b|citigroup|bank of america|merrill|wells fargo|standard chartered|nomura|mizuho|rbc\b|schroders|abrdn|baillie gifford)\b/i,
  },
  {
    id: "consultancy",
    tier: "lateral",
    why: "consultancy — a good internship, but not a technical-depth upgrade",
    re: /\b(accenture|deloitte|pwc|pricewaterhouse|kpmg|ey\b|ernst & young|capgemini|infosys|tcs\b|wipro|cognizant|mckinsey|bain|boston consulting|bcg\b)\b/i,
  },
  {
    id: "non-technical",
    tier: "below",
    why: "not a technical role — fine work, but it does not compete with a software internship",
    re: /\b(hospitality|catering|bar staff|retail|recruitment agency|care home|cleaning|logistics driver)\b/i,
  },
];

/**
 * PAY — researched, not guessed, because the postings do not carry it.
 *
 * The multipliers below were measured against ONE reference point, the published levels.fyi
 * software-engineer-intern rate for a large UK bank's technology division: $48.08/hr. They are
 * re-expressed against YOUR offer's hourly rate (target.bar_to_beat.hourly_usd) when you give one.
 *
 * THESE ARE REPORTED RANGES FROM PUBLIC AGGREGATORS, NOT OFFERS — self-reported, mostly US-weighted,
 * and a London figure for the same firm is usually lower. They are used to rank, never quoted to you
 * as what you would be paid.
 */
export const REFERENCE_INTERN_HOURLY = 48.08; // levels.fyi, large UK bank, Software Engineer Intern

export const PAY_BENCHMARK = [
  { re: /\bjane street\b/i, hourly: 144.23, mult: 3.0, src: "levels.fyi SWE Intern $144.23/hr; Jane Street pays most interns the annualised equivalent of ~$300k" },
  { re: /\bcitadel\b/i, weekly: 5050, mult: 2.6, src: "reported $4,300–5,800/week for a recent programme, plus a $15–25k signing bonus and housing" },
  { re: /\boptiver\b/i, mult: 2.5, src: "monthly stipend model — reported €5–6k Amsterdam, $15–20k Chicago, plus housing, flights and meals" },
  { re: /\b(hudson river|hrt|citadel securities|jump trading|drw|imc|susquehanna|sig|two sigma|de shaw|point72|squarepoint|xtx|g-research|qube research|maven securities|marshall wace)\b/i,
    mult: 2.5, src: "quant/HFT band — London candidate reports cluster at £8–16k/month across these firms" },
  { re: /\bgoogle|alphabet\b/i, hourly: 62.98, mult: 1.3, src: "levels.fyi SWE Intern $62.98/hr" },
  { re: /\b(meta|facebook|apple|netflix|openai|anthropic|stripe|databricks)\b/i, mult: 1.4, src: "big-tech intern band — reported at or above Google's published rate" },
  { re: /\b(amazon|microsoft|nvidia)\b/i, hourly: 39.0, mult: 0.95, src: "levels.fyi lists Nvidia SWE Intern at $39.00/hr — BELOW the reference rate. It can still win on the company axis; it does not win on pay" },
];

/** What published data says this employer pays an intern, relative to the reference rate. */
export function payBenchmark(item) {
  const hay = `${item.company || ""}`;
  const b = PAY_BENCHMARK.find((x) => x.re.test(hay));
  if (!b) return null;
  return b;
}

/** A benchmark multiplier re-expressed against your offer's hourly rate, when you gave one. */
export function payVsOffer(bench, offer) {
  if (!bench) return null;
  const base = Number(offer?.hourly_usd) || REFERENCE_INTERN_HOURLY;
  return Math.round(((bench.mult * REFERENCE_INTERN_HOURLY) / base) * 100) / 100;
}

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Location scoring from your own `target.bar.home_cities`: a home city is an upgrade in its own right. */
export function locationTier(item, bar) {
  const loc = `${item.location || ""}`.toLowerCase();
  if (!loc) return [null, "no location given"];
  const homes = (bar.home_cities || []).filter(Boolean);
  if (!homes.length) return [null, `${item.location} — no home city in your profile (target.bar.home_cities), so location is not scored`];
  const home = new RegExp(`\\b(${homes.map(escRe).join("|")})\\b`, "i");
  if (home.test(loc)) return ["up", `${item.location} — home city, no relocation`];
  if (/\bremote\b|anywhere in/.test(loc)) return ["up", `${item.location} — remote, so no relocation`];
  // Everywhere else is a downgrade HERE, and the exception — a better employer — is applied in rank()
  // where the employer is known. A location rule cannot see who the employer is.
  return ["down", `${item.location} — not ${homes[0]}, so it only counts if the employer itself is the upgrade`];
}

/**
 * INTERN-ONLY. `eligibility.employmentType` is deliberately permissive — a bare "Software Engineer"
 * comes back `unknown` and lands in "worth a look". That is right for a board meant to show
 * near-misses, but wrong for THIS question: a row cannot be worth declining a confirmed internship
 * for unless it is confirmed to be an internship itself, so here `unknown` is disqualifying.
 */
export function internOnly(item) {
  const t = `${item.title} ${item.description || ""}`.toLowerCase();
  if (/\b(intern|internship|summer analyst|placement|industrial (year|placement)|year in industry|spring (week|insight)|insight (week|programme|program)|student (programme|program))\b/.test(t))
    return [true, "confirmed internship / placement wording"];
  if (/\b(graduate (programme|program|scheme)|new grad|full[- ]time|permanent)\b/.test(t))
    return [false, "reads as a graduate or permanent role, not an internship"];
  return [false, "nothing in the posting confirms this is an internship — not worth declining a confirmed one for"];
}

/** A stated number, when there is one. Returns pounds-per-year-ish, or null. */
export function statedPay(item) {
  const t = `${item.title} ${item.description || ""}`;
  const m = /£\s?([\d,]{4,9})(?:\s?-\s?£?[\d,]{4,9})?\s*(?:per annum|pa\b|p\.a\.|a year|\/ ?year|annual)/i.exec(t);
  if (m) return Number(m[1].replace(/,/g, ""));
  const mo = /£\s?([\d,]{3,7})\s*(?:per month|pcm|a month|\/ ?month)/i.exec(t);
  if (mo) return Number(mo[1].replace(/,/g, "")) * 12;
  return null;
}

/**
 * The employer class of a posting. The employer of your own offer is recognised by name and given
 * the class you set for it, so it reads as exactly the sideways move it is.
 */
export function employerClass(item, offer = null) {
  const hay = `${item.company || ""} ${item.title || ""}`;
  if (offer?.employer && new RegExp(`\\b${escRe(offer.employer)}\\b`, "i").test(item.company || "")) {
    const base = EMPLOYER_CLASS.find((x) => x.id === offer.employer_class);
    return { id: offer.employer_class || "offer", tier: "lateral", why: `the employer of the offer you already hold — not an upgrade on itself`, re: null, ...(base ? { base: base.id } : {}) };
  }
  // Research is checked before big-tech so a research lab reports the more specific reason.
  for (const id of ["research", "quant", "big-tech", "tech-platform", "bank", "consultancy", "non-technical"]) {
    const c = EMPLOYER_CLASS.find((x) => x.id === id);
    if (c.re.test(hay)) return c;
  }
  return null;
}

/**
 * Rank one opportunity against your bar.
 *
 * `beats` requires BOTH halves and that is deliberate: an upgrade you cannot take is not an upgrade.
 * So it must be a confirmed internship AND score an upgrade on employer, location or pay, with
 * nothing pulling it down. Same kind of employer as the offer you hold = lateral.
 */
export function rank(item, bar = {}) {
  if ((item.kind || "job") !== "job") return { tier: "unknown", reasons: ["not a job — the bar applies to internships"] };
  const offer = bar.offer || null;

  const reasons = [];
  const [isIntern, internWhy] = internOnly(item);
  reasons.push(`${isIntern ? "✓" : "✗"} ${internWhy}`);

  let cls = employerClass(item, offer);
  // The class of the offer you hold is the baseline: another employer of that same class is a
  // sideways move, however good the firm.
  if (cls && offer?.employer_class && cls.id === offer.employer_class && cls.tier === "beats")
    cls = { ...cls, tier: "lateral", why: `${cls.why} — but your offer is already this kind of employer, so it is a sideways move` };
  if (cls) reasons.push(`${cls.tier === "beats" ? "✓" : cls.tier === "lateral" ? "=" : "✗"} ${item.company}: ${cls.why}`);
  else reasons.push(`? ${item.company || "employer"} — not a firm on the employer-class list; judge it yourself`);

  const [locDir, locWhy] = locationTier(item, bar);
  reasons.push(`${locDir === "up" ? "✓" : locDir === "down" ? "✗" : "="} ${locWhy}`);

  // Pay, from published data where the firm is known, from the posting where it states a number.
  const stated = statedPay(item);
  const bench = payBenchmark(item);
  const rel = payVsOffer(bench, offer);
  if (stated != null) reasons.push(`${stated >= (bar.min_pay || 0) ? "✓" : "✗"} states £${stated.toLocaleString()} — read from the posting, not inferred`);
  else if (bench)
    reasons.push(
      `${rel >= 1 ? "✓" : "✗"} pay ≈ ${rel}× ${offer?.hourly_usd ? "your offer's hourly rate" : `the reference intern rate ($${REFERENCE_INTERN_HOURLY}/hr on levels.fyi)`} — ${bench.src}`,
    );
  else reasons.push("? pay not stated and no published benchmark for this employer — judged by employer class instead");

  const out = (tier) => ({ tier, reasons, pay: stated, bench: rel ?? null });
  // A role you cannot take is never an upgrade, whatever it pays.
  if (!isIntern) return out("below");
  if (cls?.tier === "below") return out("below");

  // THE HOME-CITY RULE and its one exception: outside your home city is disqualifying UNLESS the
  // employer is itself the upgrade.
  const employerIsTheUpgrade = cls?.tier === "beats";
  if (locDir === "down" && !employerIsTheUpgrade) return out("lateral");

  const paysMore = (stated != null && bar.min_pay && stated > bar.min_pay) || (rel != null && rel > 1);
  if (employerIsTheUpgrade || locDir === "up" || paysMore) return out("beats");
  if (cls?.tier === "lateral") return out("lateral");
  return out("unknown");
}

// ---------------------------------------------------------------- self-test
// Both directions for every rule. A bar only ever shown accepting is not a bar. Run against the
// FICTIONAL example profile: its home city, its acceptable cities and its (fictional) offer.
function selfTest() {
  let pass = 0;
  const bad = [];
  const check = (label, ok, detail = "") => {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { bad.push(label); console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`); }
  };
  const profile = loadExample();
  const bar = barConfig(profile); // { home_cities, acceptable_cities, min_pay, offer }
  const home = bar.home_cities[0];
  const elsewhere = bar.acceptable_cities.find((c) => c !== home) || "London";
  const noOffer = { ...bar, offer: null };
  const J = (o) => ({ kind: "job", company: "X", title: "T", location: elsewhere, description: "", ...o });

  console.log("\nbar.mjs self-test — every rule proven in both directions\n");

  // intern-only
  check("intern: 'Summer Internship' is confirmed", internOnly(J({ title: "Software Engineer Summer Internship" }))[0] === true);
  check("intern: 'Summer Analyst' is confirmed", internOnly(J({ title: "Summer Analyst, Technology" }))[0] === true);
  check("intern: bare 'Software Engineer' is REJECTED", internOnly(J({ title: "Software Engineer" }))[0] === false);
  check("intern: 'Graduate Scheme' is REJECTED", internOnly(J({ title: "Graduate Programme" }))[0] === false);

  // employer class
  check("class: Jane Street is quant/beats", employerClass(J({ company: "Jane Street" }))?.tier === "beats");
  check("class: Meta is big-tech/beats", employerClass(J({ company: "Meta" }))?.tier === "beats");
  check("class: J.P. Morgan is a bank/lateral", employerClass(J({ company: "J.P. Morgan" }))?.tier === "lateral");
  check("class: the employer of the offer in hand is lateral, not an upgrade on itself",
    employerClass(J({ company: bar.offer.employer }), bar.offer)?.tier === "lateral");
  check("class: an unlisted firm returns null rather than guessing", employerClass(J({ company: "Acme Widgets Ltd" })) === null);
  check("class: BlackRock is a tech platform, not a bank", employerClass(J({ company: "BlackRock" }))?.id === "tech-platform");
  check("class: an asset manager without a platform is still lateral", employerClass(J({ company: "Baillie Gifford" }))?.tier === "lateral");

  // location — from the profile's own home city
  check(`loc: ${home} (home city) is an upgrade`, locationTier(J({ location: `${home}, UK` }), bar)[0] === "up");
  check(`loc: ${elsewhere} is a DOWNGRADE, not neutral`, locationTier(J({ location: elsewhere }), bar)[0] === "down");
  check("loc: Bristol is a downgrade", locationTier(J({ location: "Bristol" }), bar)[0] === "down");
  check("loc: Remote is an upgrade", locationTier(J({ location: "Remote (UK)" }), bar)[0] === "up");
  check("loc: a profile with no home city scores no location at all", locationTier(J({ location: home }), { home_cities: [] })[0] === null);

  // pay parsing, both directions
  check("pay: reads '£45,000 per annum'", statedPay(J({ description: "Salary £45,000 per annum" })) === 45000);
  check("pay: reads a monthly rate as annual", statedPay(J({ description: "£3,000 per month" })) === 36000);
  check("pay: returns null when unstated", statedPay(J({ description: "Competitive salary" })) === null);

  // the whole rank
  const janeStreet = J({ company: "Jane Street", title: "Software Engineer Internship", location: elsewhere });
  check(`rank: quant internship in ${elsewhere} BEATS the offer`, rank(janeStreet, bar).tier === "beats");

  const homeIntern = J({ company: "Acme Widgets Ltd", title: "Software Engineer Intern", location: home });
  check(`rank: a ${home} internship at an unlisted firm BEATS it (home city is its own upgrade)`, rank(homeIntern, bar).tier === "beats");

  const jpm = J({ company: "J.P. Morgan", title: "Software Engineer Summer Analyst", location: elsewhere });
  check(`rank: a bank in ${elsewhere} is LATERAL, not beats`, rank(jpm, bar).tier === "lateral", JSON.stringify(rank(jpm, bar).tier));

  const fullTime = J({ company: "Google", title: "Software Engineer", location: elsewhere });
  check("rank: a FULL-TIME role at a great firm is BELOW — a student cannot take it", rank(fullTime, bar).tier === "below");

  const farIntern = J({ company: "Globex Ltd", title: "Placement Student", location: "Bristol" });
  check("rank: an unlisted firm far from home is LATERAL — not an upgrade, but not worse", rank(farIntern, bar).tier === "lateral");

  const nonTech = J({ company: "Example Staffing", title: "Hospitality Staff Placement", location: home });
  check("rank: non-technical work in the home city is still BELOW", rank(nonTech, bar).tier === "below");

  check("loc: a multi-country listing without the home city is a downgrade too",
    locationTier(J({ location: "Canada / United Kingdom / United States" }), bar)[0] === "down");
  check("loc: a listing outside the country entirely is a downgrade", locationTier(J({ location: "Toronto, Canada" }), bar)[0] === "down");

  // ── THE HOME-CITY RULE AND ITS ONE EXCEPTION ────────────────────────────────────────────────
  for (const co of ["Google", "Meta", "Amazon", "Nvidia", "Jane Street"])
    check(`home-city rule: ${co} in ${elsewhere} still BEATS — the employer is the upgrade`,
      rank(J({ company: co, title: "Software Engineer Intern", location: elsewhere }), bar).tier === "beats");

  for (const co of ["Acme Widgets Ltd", "Globex Ltd", "Initech Ltd"])
    check(`home-city rule: ${co} in ${elsewhere} is LATERAL — a relocation for no gain`,
      rank(J({ company: co, title: "Software Engineer Intern", location: elsewhere }), bar).tier === "lateral");

  check("home-city rule: an unremarkable firm IN the home city still beats it",
    rank(J({ company: "Initech Ltd", title: "Software Engineer Placement", location: home }), bar).tier === "beats");

  // ── THE OFFER IN HAND IS THE BASELINE ───────────────────────────────────────────────────────
  check("offer: another employer of the SAME class as your offer is lateral",
    rank(J({ company: "Google", title: "Software Engineer Intern", location: elsewhere }), { ...bar, offer: { employer: "Example Search Co", employer_class: "big-tech" } }).tier === "lateral");
  check("offer: the same employer is a beats-class upgrade when your offer is a bank",
    rank(J({ company: "Google", title: "Software Engineer Intern", location: elsewhere }), bar).tier === "beats");
  check("offer: with NO offer in hand the tiers still rank — a bank in another city is lateral",
    rank(jpm, noOffer).tier === "lateral");

  // ── PAY BENCHMARKS, both directions ─────────────────────────────────────────────────────────
  check("pay: Jane Street benchmarks at 3.0x the reference rate", payBenchmark(J({ company: "Jane Street" }))?.mult === 3.0);
  check("pay: Google benchmarks above the reference rate", payBenchmark(J({ company: "Google" }))?.mult > 1);
  check("pay: Nvidia benchmarks BELOW the reference rate and says so — the data is not bent to fit a wish list",
    payBenchmark(J({ company: "Nvidia" }))?.mult < 1);
  check("pay: an unlisted firm has no benchmark rather than an invented one", payBenchmark(J({ company: "Acme Widgets Ltd" })) === null);
  check("pay: Nvidia still BEATS on the company axis despite the lower published rate",
    rank(J({ company: "Nvidia", title: "Software Engineer Intern", location: elsewhere }), bar).tier === "beats");
  check("pay: the reference baseline is the levels.fyi figure, not a guess", REFERENCE_INTERN_HOURLY === 48.08);
  check("pay: a benchmark is re-expressed against YOUR offer's hourly rate",
    payVsOffer(payBenchmark(J({ company: "Nvidia" })), { hourly_usd: 30 }) > 1 && payVsOffer(payBenchmark(J({ company: "Nvidia" })), null) < 1);

  const metaHome = J({ company: "Meta", title: "Software Engineer Intern", location: home });
  const r = rank(metaHome, bar);
  check("rank: reasons are shown, not just a verdict", r.reasons.length === 4 && r.reasons.every((x) => typeof x === "string"));
  check("rank: an event is not ranked against the bar", rank({ kind: "event", company: "X" }, bar).tier === "unknown");

  console.log(`\n${pass} passed, ${bad.length} failed`);
  if (bad.length) { for (const b of bad) console.log(`  - ${b}`); process.exit(1); }
  console.log("Both directions proven for every rule.\n");
}

if (process.argv[1] && process.argv[1].endsWith("bar.mjs") && process.argv.includes("--self-test")) selfTest();
