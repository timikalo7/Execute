---
name: thinking-lenses
description: >
  Reasoning-mode lenses — one-word frames to force a specific kind of thinking on a decision,
  plan, claim, or idea. Use when evaluating a choice, pressure-testing a plan, checking a factual
  claim, explaining a concept, or de-risking a launch — either because the owner types a lens name
  (DEVILS / RECEIPTS / ELI5 / PREMORTEM / TRADEOFFS / SOCRATES / FIRST) or because the situation
  calls for that frame. Pairs with the plan-first rule and mcp-and-prompt-craft.
---

# thinking-lenses — pick the frame that fits the decision

Seven lenses. The owner can invoke one by typing its name before a question; Execute should also
reach for the right one unprompted during planning, viability, and review — a decision gets a
better answer when it's run through the matching frame instead of a generic reply.

| Lens | Forces you to… | Use when |
|---|---|---|
| **DEVILS** | argue AGAINST the plan — the strongest case for why it's wrong/will fail | before committing to a plan or a scope call; when everyone already agrees |
| **RECEIPTS** | back every claim with real data/sources; separate fact from vibes; say "unverified" when you can't | any factual/market/technical claim that a decision rests on (pairs with "never ship a hallucinated API" + WebSearch) |
| **ELI5** | explain it plainly, no jargon, as if to a smart beginner | owner is learning a concept; a spec/PR needs a plain summary; complexity is hiding a gap |
| **PREMORTEM** | assume it already failed 3 months out and write the autopsy — what killed it | before a launch/ship/big-bet; surfaces the risk you're not naming (distribution, no one knew it existed, etc.) |
| **TRADEOFFS** | lay out options as explicit pros/cons/when-to-pick, not one recommendation | a real fork (service vs product, stack A vs B, build vs buy) |
| **SOCRATES** | ask the sharp questions back instead of answering — expose the owner's real constraints/assumptions | the ask is underspecified, or the owner is solving the wrong problem |
| **FIRST** | reason from first principles — strip to fundamentals, rebuild without inherited assumptions | "how does this actually work / what's the simplest path", stuck on convention |

## How to apply
- **Named:** owner types `DEVILS: should I …` → answer purely in that frame.
- **Unprompted:** in the plan-first step, run a plan through DEVILS + PREMORTEM before presenting it;
  run a load-bearing claim through RECEIPTS; frame a genuine fork as TRADEOFFS. Don't announce the
  lens in caveman replies — just deliver the sharper answer.
- Lenses compose: PREMORTEM a plan, then DEVILS the mitigation.
- Keep it honest: RECEIPTS means say "I couldn't verify" rather than inventing a citation.

Source: a public creator reel demoing keyword reasoning-prefixes (2026-07). The technique is generic;
these are the durable frames, not a product.
