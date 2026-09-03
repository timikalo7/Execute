---
name: kept-promises
description: >
  Audit every instruction the owner gave against what actually landed in git. Use when the owner
  asks what happened to something they asked for, whether a request was implemented, what is still
  outstanding, or how they can verify a completion claim — and run it at every milestone alongside
  the learner. Produces KEPT / WEAK / NO TRACE / PHANTOM verdicts per instruction, and flags any
  commit sha that was quoted in a reply but does not exist.
---

# kept-promises — the count, not the promise

**The owner, 2026-08-28:** *"how are you gna prove to me that you acc implement the things I say
because for example if I don't ask you will just move on as if it's been implemented and I don't
know how many things you have done that for."*

That cannot be answered by promising harder. It needs a **number**, produced by reading the record
rather than by remembering it — the same shape as `correction-capture`, for the same reason: the
failure mode is forgetting, so the mechanism must not depend on remembering.

```bash
node .claude/skills/kept-promises/ledger.mjs --all          # full audit
node .claude/skills/kept-promises/ledger.mjs --all --open   # just what needs eyes
node .claude/skills/kept-promises/ledger.mjs --selftest     # 29 assertions
```

## The verdicts

| verdict | meaning |
|---|---|
| **KEPT** | A commit after that turn matches strongly, or the reply quoted a sha that resolves. |
| **WEAK** | Something matches, thinly. **This is where the real risk lives** — work landed, but maybe not the work that was asked for. |
| **NO TRACE** | Nothing in history matches. |
| **PHANTOM** | A commit sha was quoted in a reply and **does not exist**. Loudest possible finding. |

**NO TRACE is a review list, not an accusation**, and saying so is load-bearing. An instruction
answered in chat needs no commit, and a commit that used different words is missed — *"implement
graphify"* landed as `projects/example-code-graph` and keyword matching could not see it. A number presented
as more precise than it is would be worse than no number.

## Why sha-linking matters more than keywords

Keyword overlap guesses. A commit sha quoted back in a reply is a claim that can be **checked
against git**. So the ledger pulls every sha-shaped token out of the replies that followed an
instruction and resolves each one with `git cat-file -e`. A sha that does not resolve means a commit
was claimed and none exists — which is exactly the failure the owner is asking about, so it is its
own verdict and is never quietly folded into a softer one.

## The bug this tool had, and why it is written down here

The first draft placed the record separator at the **end** of `--pretty=format` while using
`--name-only`. Git puts the file list after the commit, so every chunk after the first began with
filenames, parsed to nothing, and the audit saw **one commit**. It then reported **25 NO TRACE out
of 28** — a tool confidently, loudly wrong about the very thing it exists to measure, and wrong in
the direction that would have made the author look worse rather than better.

It was caught because `1 commits searched` was printed in the header and did not match a repo with
217 commits. **A tool that reports a verdict must also report the size of the evidence it looked
at** — that line is the only reason the number was doubted instead of believed. `loadCommits` is now
covered by assertions that fail if history stops parsing.

## The limits, stated

Keyword matching is coarse in both directions: it misses synonyms and it credits a commit that
merely mentions the right noun. The instruction classifier excludes questions, navigation
(*"next reel"*), acknowledgements and pasted coding exercises, but it is regex-based and will
mis-file some turns. **Read the WEAK list**; a mis-attributed commit there looks exactly like a kept
promise until somebody checks.
