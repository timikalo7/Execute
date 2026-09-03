---
name: second-opinion
description: >
  Get an independent code review from a non-Anthropic model (OpenAI API). Use when a
  build is finished and every internal gate is green, because Execute's gates and
  evaluator agents all run on the same model family that wrote the code — a different
  model is the only evaluator that does not share those blind spots. Needs
  OPENAI_API_KEY in the environment and real API credit.
---

# second-opinion — an evaluator that does not share our blind spots

`memory/agent-graph-engineering.md` rule 1: evaluators judge the artifact in fresh
context, never the builder's reasoning. This goes one step further — a **different
model** judges it. A same-family evaluator in fresh context still shares training,
habits and failure modes with the builder. That is the gap this closes, and it is the
only thing here that is genuinely outside Execute's reach.

```bash
node .claude/skills/second-opinion/review.mjs projects/example-code-graph/an example code graph.mjs \
  --ask "does the call-site resolution have a case it gets silently wrong?"
```

## Before it will work

**A Codex / ChatGPT subscription does NOT include API credit.** They are separate
meters. A key can be Active and every call still fail with a quota error. Check
`platform.openai.com` → Billing for a non-zero balance first; the script names this
failure explicitly rather than letting it look like a bug.

## Handling the key

- Lives in the **environment** as `OPENAI_API_KEY`. Never in the repo, never in a
  commit, never pasted into a chat transcript.
- The container is wiped between turns, so set it in the environment configuration, not
  inline.
- The script reads it from `process.env` and never writes it anywhere.

## What gets sent

**Only the files named on the command line.** Read them before running — this is an
outbound transfer to a third party, and once sent it may be logged or retained there.
Never send anything holding personal data to a third-party model. A project that carries real
addresses, contact details or anyone else's information does not go through this without the owner
deciding so explicitly, file by file.

## Reading the result

It is one more opinion, not a verdict. A different model is confidently wrong in
different places than we are — which is the point, and also the reason to verify a
finding before acting on it. Treat it exactly like a sub-agent's report:
`CLAUDE.md` rule 9 still applies, so confirm anything it claims against the code.
