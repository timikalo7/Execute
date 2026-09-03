#!/usr/bin/env node
/**
 * video-judge — a DIFFERENT model looks at the reference walkthrough and at ours, and says whether
 * they are the same design. Loop until it says yes.
 *
 * Owner's instruction: *"u should loop until the evaluator looks at the video and what u generated s
 * video and says its the same."*
 *
 * Why this and not the checks that already exist. `fidelity.mjs` reads five DOM properties;
 * `pixel-profile.mjs` reads four image statistics. Both passed or under-reported a page that was
 * rejected on sight, because neither can answer "does this look like the same thing" — that is a
 * judgement, and a judgement needs something that can see.
 *
 * Two rules make it an evaluator rather than a mirror:
 *
 *   1. **A different model family from the builder.** An evaluator sharing the builder's blind
 *      spots inherits them (`memory/agent-graph-engineering.md` §1). Any OpenAI-compatible vision
 *      endpoint works — the free tiers of OpenRouter, Groq, Together and Gemini all fit — and the
 *      point is that it is NOT the model that wrote the page.
 *   2. **Fresh context, artifact only.** It receives the two frame sets and the rubric. It never
 *      receives the build's reasoning, its commit messages, or its own previous verdicts.
 *
 * Without a key it reports NOT CHECKED and exits non-zero. It never reports pass. A skipped check
 * announced as a pass is the failure this whole file exists to correct.
 *
 *   node video-judge.mjs --ref-frames <dir> --built-frames <dir> [--json out.json]
 *   node video-judge.mjs --selftest
 *
 * Config, all from the environment:
 *   VISION_JUDGE_URL    OpenAI-compatible chat/completions endpoint
 *   VISION_JUDGE_MODEL  a vision-capable model id
 *   VISION_JUDGE_KEY    the API key
 */

import fs from "node:fs";
import path from "node:path";

export const RUBRIC = `You are comparing two scroll-through walkthroughs of two different websites.

SET A is the reference design. SET B is an attempt to build a site in the same visual language.
The CONTENT is deliberately different — different company, different words, different subject
matter. You are not judging whether they show the same thing.

Judge ONLY whether B belongs to the same visual world as A. Consider:
  - pacing: how much room each section gets, how empty or full the screens are
  - tonal structure: how often and how dramatically the ground changes
  - typographic voice: weight, width, case, scale relative to the viewport
  - imagery treatment: photographic vs drawn, cut-out vs framed, how the subject sits on the ground
  - overall level of finish

Answer in strict JSON, no prose outside it:
{
  "same": true | false,
  "confidence": 0.0-1.0,
  "differences": ["specific, actionable difference", "..."],
  "worst": "the single most damaging difference, in one sentence"
}

Be harsh. If a designer would not accept B as being in A's family, "same" is false.`;

export function loadFrames(dir, max = 6) {
  if (!fs.existsSync(dir)) throw new Error(`frame directory not found: ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (!files.length) throw new Error(`no frames in ${dir}`);
  // Even spread across the walkthrough rather than the first N, so the sample covers the whole page.
  const step = Math.max(1, Math.floor(files.length / max));
  return files.filter((_, i) => i % step === 0).slice(0, max).map((f) => path.join(dir, f));
}

export function toDataUrl(file, read = fs.readFileSync) {
  const b64 = read(file).toString("base64");
  const ext = path.extname(file).toLowerCase() === ".png" ? "png" : "jpeg";
  return `data:image/${ext};base64,${b64}`;
}

export function buildRequest({ model, refFrames, builtFrames, rubric = RUBRIC, toUrl = toDataUrl }) {
  const content = [{ type: "text", text: rubric }, { type: "text", text: "SET A — the reference:" }];
  for (const f of refFrames) content.push({ type: "image_url", image_url: { url: toUrl(f) } });
  content.push({ type: "text", text: "SET B — the build under review:" });
  for (const f of builtFrames) content.push({ type: "image_url", image_url: { url: toUrl(f) } });
  return { model, temperature: 0, messages: [{ role: "user", content }] };
}

export function parseVerdict(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in judge response: ${String(text).slice(0, 160)}`);
  const v = JSON.parse(m[0]);
  if (typeof v.same !== "boolean") throw new Error("judge response has no boolean `same`");
  return { same: v.same, confidence: Number(v.confidence ?? 0), differences: v.differences || [], worst: v.worst || "" };
}

export async function judge({ url, key, model, refFrames, builtFrames, doFetch = fetch }) {
  const res = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(buildRequest({ model, refFrames, builtFrames })),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? data?.content?.[0]?.text ?? "";
  return parseVerdict(text);
}

/* --------------------------------------------------------------------------- selftest */

function selfTest() {
  let pass = 0, fail = 0;
  const check = (ok, what) => { ok ? pass++ : (fail++, console.log(`  FAIL  ${what}`)); };

  check(parseVerdict('{"same":true,"confidence":0.9,"differences":[],"worst":""}').same === true, "a positive verdict parses");
  check(parseVerdict('noise before {"same":false,"confidence":0.4,"differences":["a"],"worst":"b"} after').same === false,
    "a verdict wrapped in prose still parses");
  let threw = false; try { parseVerdict("no json at all"); } catch { threw = true; }
  check(threw, "a response with no JSON throws instead of being read as a pass");
  threw = false; try { parseVerdict('{"confidence":1}'); } catch { threw = true; }
  check(threw, "a response missing `same` throws — an ambiguous verdict is never a pass");

  const req = buildRequest({ model: "m", refFrames: ["a.jpg", "b.jpg"], builtFrames: ["c.jpg"], toUrl: (f) => `data:${f}` });
  const parts = req.messages[0].content;
  check(parts.filter((p) => p.type === "image_url").length === 3, "every frame is attached");
  // Anchored to the separator line, not to any mention of "SET B" — the rubric names both sets, so
  // a loose match finds the rubric at index 0 and the assertion silently tests nothing.
  check(parts.findIndex((p) => p.type === "text" && /^SET B —/.test(p.text)) > parts.findIndex((p) => p.image_url?.url === "data:b.jpg"),
    "set B is introduced after set A's frames, so the two sets cannot be confused");
  check(/Be harsh/.test(req.messages[0].content[0].text), "the rubric tells the judge to be harsh");
  check(req.temperature === 0, "temperature is 0 — a design verdict should not vary run to run");

  const spread = loadFrames.toString();
  check(/step/.test(spread), "frames are sampled across the walkthrough rather than taken from the front");

  // the transport, mocked both ways
  const ok = { ok: true, json: async () => ({ choices: [{ message: { content: '{"same":false,"confidence":0.8,"differences":["pacing"],"worst":"too dense"}' } }] }) };
  const bad = { ok: false, status: 429, text: async () => "rate limited" };
  return (async () => {
    const v = await judge({ url: "x", key: "k", model: "m", refFrames: [], builtFrames: [], doFetch: async () => ok });
    check(v.same === false && v.worst === "too dense", "a real verdict round-trips through the transport");
    let err = null;
    try { await judge({ url: "x", key: "k", model: "m", refFrames: [], builtFrames: [], doFetch: async () => bad }); } catch (e) { err = e; }
    check(err && /429/.test(err.message), "an API error throws rather than degrading into a pass");
    console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — video-judge: ${pass} passed, ${fail} failed`);
    return fail;
  })();
}

/* --------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit((await selfTest()) ? 1 : 0);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

  const url = process.env.VISION_JUDGE_URL, key = process.env.VISION_JUDGE_KEY, model = process.env.VISION_JUDGE_MODEL;
  if (!url || !key || !model) {
    console.error("NOT CHECKED — no vision judge configured.");
    console.error("  Set VISION_JUDGE_URL, VISION_JUDGE_MODEL and VISION_JUDGE_KEY (see SETUP-KEYS.md).");
    console.error("  This is reported as NOT CHECKED and exits non-zero. It is never a pass.");
    process.exit(4);
  }

  const refFrames = loadFrames(arg("--ref-frames"));
  const builtFrames = loadFrames(arg("--built-frames"));
  console.log(`judging ${builtFrames.length} built frames against ${refFrames.length} reference frames via ${model}`);

  const v = await judge({ url, key, model, refFrames, builtFrames });
  if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify(v, null, 2) + "\n");

  console.log(`\nsame: ${v.same}   confidence: ${v.confidence}`);
  if (v.worst) console.log(`worst: ${v.worst}`);
  for (const d of v.differences) console.log(`  - ${d}`);
  console.log(v.same ? "\nRESULT: pass — the judge accepts the build as the same design language." : "\nRESULT: FAIL — the judge does not.");
  process.exit(v.same ? 0 : 1);
}
