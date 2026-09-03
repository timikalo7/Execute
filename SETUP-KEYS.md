# SETUP-KEYS — credentials Execute may ask you for

Nothing here is stored in the repo. Every row is an environment variable you set in your
**environment configuration** (or a local `.env`, which is git-ignored) — never in a file that gets
committed, never in a commit message, and never pasted into a chat transcript. `security-gate` fails
the push on a tracked `.env` or a hardcoded secret.

**Nothing in this table is required to run Execute.** The gates, the agents and almost every skill
work with none of it set. Each row buys one specific capability, and the tool that needs it says so
when it is missing — it reports NOT CHECKED and exits non-zero rather than quietly passing.

| key | status | what it unlocks | where to get it |
|---|---|---|---|
| `OPENAI_API_KEY` | ⏳ not set | `second-opinion` — an independent code review from a non-Anthropic model | `platform.openai.com` → API keys (needs real API credit) |
| `VISION_JUDGE_URL` / `VISION_JUDGE_MODEL` / `VISION_JUDGE_KEY` | ⏳ not set | the design loop's third leg — a different model judging whether your build matches its reference | any OpenAI-compatible vision endpoint |
| `FIRECRAWL_API_KEY` | ⏳ not set | a faster backend for `crawl-site` | `firecrawl.dev` — optional, the crawler is keyless by default |

Mark a row ✅ once it is set, and add a row whenever you leave a `TODO(keys)` marker in the code —
`system-design-gate` fails the push when the two disagree.

## `OPENAI_API_KEY` — note that a subscription is not API credit

`second-opinion` exists because Execute's gates and evaluator agents all run on the same model family
that wrote the code; a different model is the only evaluator that does not share those blind spots.

A ChatGPT or Codex subscription **does not include API credit** — the API bills separately, and until
the account has a balance every call returns a quota error. Add credit at
`platform.openai.com` → Billing (the minimum is small), then set the key in your environment
configuration.

Until it is set, `second-opinion` exits 2 with a message pointing here. That is the
scaffold-around-a-missing-credential pattern from `CLAUDE.md`: everything around the key is built,
and only the key is missing.

## The vision judge — the design loop's exit condition

`.claude/skills/visual-qa/design-loop.sh` records a reference and your build as walkthrough videos
and asks a **different model** whether they are the same design. It is the only check that can
answer that question: `fidelity.mjs` compares a handful of DOM values and `pixel-profile.mjs`
compares image statistics, and both can pass a page a human rejects on sight.

Three variables, any OpenAI-compatible vision endpoint (OpenRouter, Groq, Together, Google AI Studio
and self-hosted aggregators all speak the same protocol, so the judge needs no code change):

| variable | what it is |
|---|---|
| `VISION_JUDGE_URL` | the chat/completions endpoint |
| `VISION_JUDGE_MODEL` | a vision-capable model id available there |
| `VISION_JUDGE_KEY` | the API key |

The one hard requirement is that it is **not the model that wrote the page** — an evaluator sharing
the builder's blind spots inherits them.

Until it is set, the loop and the judge both report **NOT CHECKED and exit non-zero**. Neither ever
reports a pass on a missing key.
