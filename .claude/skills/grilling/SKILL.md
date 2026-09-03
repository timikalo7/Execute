---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the environment (filesystem, tools, etc.), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.

---

## Execute addendum (this repo)
Vendored from **mattpocock/skills** (`skills/productivity/grilling`, MIT — see `LICENSE-mattpocock`).
Markdown only; no scripts or agent configs were vendored.

Execute uses this as its **interrogation engine**. It is invoked by the `discovery-interrogation`
skill during `/kickoff` (before research), and before any non-trivial `/add-feature`, `/improve`, or
redesign — see that skill for Execute's question bank and the `Discovery.md` artifact the session
must produce.

Two Execute-specific notes that do NOT relax the rules above:
- **One question at a time still holds.** You may render that single question as an `AskUserQuestion`
  with 2–4 concrete options (recommended option first) — the owner works caveman and clicking beats
  typing. One question per turn, always; never batch.
- **Write the outcome down.** A grilling session ends by writing/updating `Discovery.md` (answers ·
  assumptions · what this changes about the plan · open questions). Handoffs are artifacts, not
  conversation (`memory/agent-graph-engineering.md`).
