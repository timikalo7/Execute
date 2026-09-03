# Agent graph engineering — how Execute organizes its agents

**Doctrine: the graph is the product, not the loop.** A single agent loop (goal → plan → iterate →
hit metric → repeat until pass) is the unit of work. The **graph** is the organization *above* the
loops: specialized nodes, each running its own internal loop, wired together by deliberate rules
about what context flows between them. Execute already has the nodes (`.claude/agents/`); this file
is the wiring law.

Source: the "graph engineering" framing (Peter Steinberger, 2026-07) + Execute's own build history.

## 1. Loop vs graph
- **Loop** — one agent + maybe one evaluator, optimizing one target metric. Fine for a single ticket.
- **Graph** — many domain-scoped nodes (plan · build · test · review · secure · learn), each with its
  own loop and its own metric, connected so that no single metric can run away with the outcome. The
  graph is what keeps the *business/product* outcome coherent when each node optimizes locally.
- **Build order (do not skip):** get **one loop** working → extend it to a second specialized node →
  give each node its own loop → only then wire the whole system. Don't design a 9-node graph for a
  one-loop problem.

## 2. Execute's graph
```
        idea
          │
     [research] ──► [viability] ──► OWNER APPROVAL (the one human node)
                                          │
                                       [Plan/pm]  ← architect tier (Fable)
                                          │  tickets (deps / blockers / human-in-loop)
             ┌────────────┬───────────────┼───────────────┐
        [developer]   [designer]      [qa]            (build tier)
             └────────────┴───────────────┘
                          │ artifact only
        [product] · [security-reviewer] · GATES (visual-qa · security-gate · system-design-gate)
                          │
                      [learner] ──► memory/* + PROJECT-LOG.md ──► feeds the next run
```

## 3. Context-flow rules (the actual engineering)
1. **Evaluators judge the ARTIFACT, not the author's reasoning.** `qa`, `product`,
   `security-reviewer`, and the gates must be given the built thing + the requirements — **not** the
   builder's self-justification, not its "I verified this works" narration. A tester that reads the
   builder's reasoning inherits its blind spots. Spawn evaluator agents with fresh context and the
   spec, never with the builder's transcript.
2. **Each node gets the minimum context to do its job.** Pass the ticket + the spec + the paths, not
   the whole history. This is also the context-hygiene rule (40–80% band) applied across the graph.
3. **Handoffs are artifacts, not conversations.** Commits, files, PROJECT-LOG entries, gate stamps —
   durable things the next node can read. A dead agent's tree is preserved (`hook/<ticket>` stash)
   because the handoff, not the chat, is the state.
4. **Each node owns one metric.** developer=works, designer=taste law, qa=tests pass,
   security-reviewer=no exploitable path, product=meets requirements, learner=lessons captured. When
   two nodes conflict (speed vs safety), it escalates to the planning thread/owner — it does NOT get
   silently traded away inside one agent's head.

## 4. Why one loop breaks — four failure modes, and Execute's mitigation
| Failure | What it looks like | Execute's mitigation |
|---|---|---|
| **Metric gaming** (Goodhart) | the score improves, the real outcome doesn't — e.g. tests pass because they were weakened, a11y "passes" because the check was narrowed | multiple independent nodes with different metrics; gates are versioned in-repo so a weakened check is a visible diff; `product` judges against requirements, not against the gate |
| **Target blindness** | the agent optimizes toward a target but can't tell the target is wrong ("build the thing right" vs "build the right thing") | the Viability Gate + owner approval sit *above* the build graph; `product` re-checks deliverables against requirements; the PREMORTEM/DEVILS lenses (`thinking-lenses`) are run on the plan before build |
| **Conflicting objectives** | speed, quality, safety, cost each improve locally while the whole degrades | one metric per node + explicit escalation; ship-blockers (a11y, data-rights, e-commerce guideline, security) are **non-negotiable** so they can't be traded for speed |
| **Evaluator decay** | the checkers themselves drift/rot — "if nobody checks the checker, the system produces green lights disconnected from reality" | **see §5 — this one is Execute's biggest live risk** |

## 5. Check the checker (evaluator decay — enforced practice)
Execute's gates (`visual-qa`, `security-gate`, `system-design-gate`, the pre-push test gate) are
checkers that nobody checks. Rules:
- **Never weaken a gate to make a push succeed.** Fix the finding. Weakening a check is a
  process failure; if a rule is genuinely wrong, change it deliberately in its own commit with the
  reason in the message — never as a side effect of unblocking work.
- **A gate that passes on a known-broken tree is a bug in the gate.** When something ships broken that
  a gate should have caught, the fix is TWO changes: fix the thing, and fix/extend the gate. The
  `learner` records both.
- **Prove the gate still bites.** When adding or changing a gate rule, verify it FAILS on a
  deliberately-bad input and PASSES on a good one (as done for the e-commerce and deleted-project
  rules) — a green result from an untested checker means nothing.
- **`EXECUTE_GATE_BYPASS=1` is owner-emergency only**, and its use must be logged in PROJECT-LOG.md.
- Watch for silent no-ops: a checker that skips (missing deps, absent dir, no test script) is not a
  pass. Skips must be reported loudly, not swallowed.

## 6. When to grow the graph
Add a node when a **distinct metric** is being neglected or when one agent is being asked to hold
conflicting objectives — not because more agents feels more sophisticated. Every node costs context,
credit, and handoff risk. Start with one loop; grow only where the outcome is actually leaking.
