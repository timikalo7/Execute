#!/usr/bin/env node
/**
 * An independent review from a NON-Anthropic model.
 *
 * Why this exists: Execute's gates and evaluator agents all run on the same family of
 * model that wrote the code. `memory/agent-graph-engineering.md` says evaluators must
 * judge the artifact in fresh context, never the builder's reasoning — this goes one
 * step further and judges it with a different model entirely, which is the one kind of
 * blind spot a same-family evaluator structurally cannot cover.
 *
 *   OPENAI_API_KEY=... node review.mjs <file> [<file> …] [--model gpt-5.1] [--ask "..."]
 *
 * The key is read from the environment and never written anywhere. Nothing is sent
 * except the files named on the command line — read them before you run this.
 */
import fs from "node:fs";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY is not set.");
  console.error("Set it in the environment (never in the repo) — see SETUP-KEYS.md.");
  process.exit(2);
}

const args = process.argv.slice(2);
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : "gpt-5.1";
const ask = args.includes("--ask") ? args[args.indexOf("--ask") + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--model" && args[i - 1] !== "--ask");

if (!files.length) { console.error("name at least one file to review"); process.exit(2); }

const bundle = files.map((f) => `--- ${f} ---\n${fs.readFileSync(f, "utf8")}`).join("\n\n");
const prompt = [
  "You are reviewing code written by another AI. Be specific and adversarial.",
  "Do not compliment. For each finding give: the file, the line, what breaks, and the input that breaks it.",
  "If a claim in a comment or README is not supported by the code, say so.",
  "If you find nothing serious, say that plainly instead of inventing something.",
  ask ? `\nThe author specifically wants to know: ${ask}` : "",
  "\n\n" + bundle,
].join("\n");

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`HTTP ${res.status}`);
  // The single most likely failure, called out so it is not mistaken for a bug here.
  if (/quota|billing|insufficient/i.test(body))
    console.error("→ the account has no API credit. A Codex/ChatGPT subscription does NOT include\n  API credit; add it at platform.openai.com → Billing.");
  console.error(body.slice(0, 600));
  process.exit(1);
}

const json = await res.json();
console.log(json.choices?.[0]?.message?.content ?? JSON.stringify(json).slice(0, 800));
console.log(`\n--- ${model} · ${json.usage?.total_tokens ?? "?"} tokens ---`);
