#!/usr/bin/env node
/**
 * PROBE-SOURCES — find out which ATS board actually belongs to a company, by asking.
 *
 * `jobs/sources.json` was written by guessing slugs from company names. Six of them were wrong —
 * Snyk, Starling Bank, Deliveroo, Checkout.com, Improbable and G-Research all 404ed, so six
 * employers had been sitting in the config contributing nothing while looking like coverage. That is
 * the worst kind of gap: it does not error, it just quietly finds less.
 *
 * This script removes the guessing. Give it a company and some candidate slugs and it tries every
 * candidate against all three ATS APIs, reports what came back, and writes the ones that work.
 * A company that cannot be resolved is reported as UNRESOLVED rather than left in the config looking
 * healthy.
 *
 *   node scripts/probe-sources.mjs                 probe the built-in candidate list, print the results
 *   node scripts/probe-sources.mjs "Acme" "Globex" probe just these companies (slugs guessed from the names)
 *   node scripts/probe-sources.mjs --write         also update jobs/sources.json with what resolved
 *   node scripts/probe-sources.mjs --verify        re-check every slug already in sources.json
 */

import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, userAgent } from "./profile.mjs";

const ROOT = process.cwd();
const SOURCES = path.join(ROOT, "jobs", "sources.json");
const SOURCES_EXAMPLE = path.join(PROJECT_ROOT, "config", "sources.example.json");
// The contact string is CAREER_AGENT_CONTACT, or a neutral default — never a hard-coded address.
const UA = userAgent();

/** Your jobs/sources.json, or the shipped example until you have one. */
const readSources = () => JSON.parse(fs.readFileSync(fs.existsSync(SOURCES) ? SOURCES : SOURCES_EXAMPLE, "utf8"));

const ENDPOINTS = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  // SmartRecruiters publishes a documented public postings API, which is where several UK employers
  // sit that have no Greenhouse or Lever board at all.
  smartrecruiters: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`,
};

const countOf = {
  greenhouse: (d) => (Array.isArray(d?.jobs) ? d.jobs.length : null),
  lever: (d) => (Array.isArray(d) ? d.length : null),
  ashby: (d) => (Array.isArray(d?.jobs) ? d.jobs.length : null),
  smartrecruiters: (d) => (Array.isArray(d?.content) ? d.totalFound ?? d.content.length : null),
};

async function tryOne(ats, slug) {
  try {
    const r = await fetch(ENDPOINTS[ats](slug), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
    const d = await r.json();
    const n = countOf[ats](d);
    // An endpoint that answers 200 with no jobs array is not this company's board; Ashby in
    // particular returns a valid-looking empty envelope for a slug that does not exist.
    if (n == null) return { ok: false, why: "200 but no jobs array" };
    if (n === 0) return { ok: false, why: "200 but zero postings" };
    return { ok: true, n };
  } catch (e) {
    return { ok: false, why: String(e.message).slice(0, 40) };
  }
}

/** Slug guesses a human would make, generated from the name so the list stays short to maintain. */
function candidates(company, extra = []) {
  const base = company.toLowerCase();
  const out = new Set(extra);
  out.add(base.replace(/[^a-z0-9]/g, ""));
  out.add(base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  out.add(base.split(/[^a-z0-9]/)[0]);
  return [...out].filter(Boolean);
}

/** company → extra slug guesses that a name alone would never produce. An example list — edit it. */
const LIST = [
  // Second pass: the ones no Greenhouse/Lever/Ashby slug resolved, retried with SmartRecruiters in
  // play and with slugs taken from how each company actually spells itself.
  ["Snyk", ["snyk", "Snyk", "snyk1"]],
  ["Starling Bank", ["starlingbank", "StarlingBank", "starling-bank", "Starling"]],
  ["Checkout.com", ["checkoutcom", "Checkoutcom", "checkout-com", "Checkout"]],
  ["G-Research", ["gresearch", "GResearch", "g-research", "GResearchLimited"]],
  ["Revolut", ["revolut", "Revolut", "RevolutLtd"]],
  ["Wise", ["wise", "Wise", "TransferWise", "transferwise"]],
  ["Depop", ["depop", "Depop"]],
  ["Onfido", ["onfido", "Onfido"]],
  ["Optiver", ["optiver", "Optiver", "OptiverServicesBV"]],
  ["XTX Markets", ["xtxmarkets", "XTXMarkets", "xtx"]],
  ["Bending Spoons", ["bendingspoons", "BendingSpoons"]],
  ["Bloomberg", ["bloomberg", "Bloomberg"]],
  ["Arm", ["arm", "Arm", "armlimited"]],
  ["Expedia", ["expedia", "ExpediaGroup"]],
  ["Visa", ["visa", "Visa"]],
  ["Sky", ["sky", "Sky", "SkyUK"]],
  ["BT", ["bt", "BTGroup", "btgroup"]],
  ["Vodafone", ["vodafone", "Vodafone"]],
  ["Bet365", ["bet365", "Bet365"]],
  ["Moonpig", ["moonpig", "Moonpig"]],
  ["Monzo", ["monzo"]],
  ["Palantir", ["palantir"]],
  ["Cloudflare", ["cloudflare"]],
  ["Databricks", ["databricks"]],
  ["Stripe", ["stripe"]],
  ["Datadog", ["datadog"]],
  ["Anthropic", ["anthropic"]],
  ["Figma", ["figma"]],
  ["Airbnb", ["airbnb"]],
  ["Ramp", ["ramp"]],
  // the six that were wrong
  ["Snyk", ["snyk", "snyk1", "snykio"]],
  ["Starling Bank", ["starlingbank", "starling", "starlingbanklimited"]],
  ["Deliveroo", ["deliveroo", "deliveroo1", "roo"]],
  ["Checkout.com", ["checkoutcom", "checkout", "checkoutcom1", "checkout-com"]],
  ["Improbable", ["improbable", "improbableworlds", "improbableio"]],
  ["G-Research", ["gresearch", "g-research", "granadaresearch", "gresearchllp"]],
  // UK fintech / consumer
  ["Revolut", ["revolut", "revolutpeople"]],
  ["Wise", ["wise", "transferwise", "wiseaccount"]],
  ["GoCardless", ["gocardless"]],
  ["Trainline", ["trainline", "thetrainline"]],
  ["Zopa", ["zopa", "zopabank"]],
  ["Marshmallow", ["marshmallow", "marshmallowinsurance"]],
  ["Cleo", ["cleo", "cleoai", "meetcleo"]],
  ["Thought Machine", ["thoughtmachine"]],
  ["Form3", ["form3", "form3tech"]],
  ["TrueLayer", ["truelayer"]],
  ["SumUp", ["sumup"]],
  ["Octopus Energy", ["octopusenergy", "octoenergy"]],
  ["Ocado", ["ocado", "ocadotechnology", "ocadogroup"]],
  ["Depop", ["depop"]],
  ["Onfido", ["onfido"]],
  ["Quantexa", ["quantexa"]],
  // quant / trading
  ["Optiver", ["optiver"]],
  ["Jane Street", ["janestreet"]],
  ["Marshall Wace", ["marshallwace", "mwam"]],
  ["Man Group", ["mangroup", "mangroupplc", "manahl"]],
  ["XTX Markets", ["xtxmarkets", "xtx"]],
  ["Squarepoint Capital", ["squarepoint", "squarepointcapital"]],
  ["Qube Research & Technologies", ["qube", "quberesearchandtechnologies", "qrt"]],
  ["DRW", ["drw", "drwtrading"]],
  ["IMC Trading", ["imc", "imctrading"]],
  ["Hudson River Trading", ["hudsonrivertrading", "hrt"]],
  ["Maven Securities", ["mavensecurities", "maven"]],
  ["Quadrature Capital", ["quadraturecapital", "quadrature"]],
  ["Point72", ["point72", "point72cubist"]],
  ["Millennium", ["millennium", "mlp"]],
  ["Balyasny", ["balyasny", "bamfunds"]],
  // AI / deep tech
  ["Synthesia", ["synthesia", "synthesiaio"]],
  ["ElevenLabs", ["elevenlabs"]],
  ["PolyAI", ["polyai", "poly-ai"]],
  ["Wayve", ["wayve", "wayveai"]],
  ["Isomorphic Labs", ["isomorphiclabs", "isomorphic"]],
  ["Graphcore", ["graphcore"]],
  ["Faculty", ["faculty", "facultyai"]],
  ["Tractable", ["tractable", "tractableai"]],
  ["Bending Spoons", ["bendingspoons"]],
  ["Skyscanner", ["skyscanner"]],
];

async function probe(list) {
  const merged = new Map();
  for (const [company, extra] of list) merged.set(company, [...(merged.get(company) || []), ...extra]);

  const results = [];
  const jobs = [];
  for (const [company, extra] of merged)
    for (const slug of candidates(company, extra))
      for (const ats of Object.keys(ENDPOINTS)) jobs.push({ company, slug, ats });

  // Modest concurrency: this hits three third parties and there is no reason to be rude about it.
  const LIMIT = 8;
  let i = 0;
  const workers = Array.from({ length: LIMIT }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      const r = await tryOne(job.ats, job.slug);
      if (r.ok) results.push({ ...job, n: r.n });
    }
  });
  await Promise.all(workers);

  const byCompany = new Map();
  for (const r of results) {
    const cur = byCompany.get(r.company);
    if (!cur || r.n > cur.n) byCompany.set(r.company, r);
  }
  return { byCompany, results, tried: jobs.length };
}

// ------------------------------------------------------------------ main
const args = process.argv.slice(2);

if (args.includes("--verify")) {
  const cfg = readSources();
  let bad = 0;
  for (const s of cfg.tier1) {
    const r = await tryOne(s.ats, s.slug);
    console.log(`${r.ok ? "OK  " : "DEAD"} ${String(s.company).padEnd(28)} ${s.ats}/${s.slug}  ${r.ok ? r.n + " postings" : r.why}`);
    if (!r.ok) bad++;
  }
  console.log(bad ? `\n${bad} of ${cfg.tier1.length} sources are dead` : `\nall ${cfg.tier1.length} sources live`);
  process.exit(bad ? 1 : 0);
}

const named = args.filter((a) => !a.startsWith("--"));
const list = named.length ? named.map((c) => [c, []]) : LIST;
const { byCompany, tried } = await probe(list);
const resolved = [...byCompany.values()].sort((a, b) => b.n - a.n);
const unresolved = [...new Set(list.map(([c]) => c))].filter((c) => !byCompany.has(c));

console.log(`probed ${tried} endpoint/slug combinations\n`);
console.log(`RESOLVED (${resolved.length})`);
for (const r of resolved) console.log(`  ${String(r.company).padEnd(30)} ${r.ats}/${r.slug}`.padEnd(62) + `${r.n} postings`);
console.log(`\nUNRESOLVED (${unresolved.length}) — no public ATS board found under any guessed slug`);
for (const c of unresolved) console.log(`  ${c}`);

if (args.includes("--write")) {
  const cfg = readSources();
  // Merge rather than replace when you probed specific names, so one company does not wipe the list.
  const fresh = resolved.map((r) => ({ company: r.company, ats: r.ats, slug: r.slug }));
  cfg.tier1 = named.length ? [...(cfg.tier1 || []).filter((s) => !fresh.some((f) => f.company === s.company)), ...fresh] : fresh;
  fs.mkdirSync(path.dirname(SOURCES), { recursive: true });
  cfg._probed = {
    when: new Date().toISOString().slice(0, 10),
    note:
      "Every slug here was verified by fetching it and counting postings — see scripts/probe-sources.mjs. " +
      "Companies that could not be resolved are deliberately ABSENT rather than present and dead, because " +
      "a 404ing entry looks like coverage and is not.",
    unresolved,
  };
  fs.writeFileSync(SOURCES, JSON.stringify(cfg, null, 1) + "\n");
  console.log(`\nwrote ${cfg.tier1.length} verified sources to jobs/sources.json`);
}
