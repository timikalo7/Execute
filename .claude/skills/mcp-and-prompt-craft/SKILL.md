---
name: mcp-and-prompt-craft
description: >
  How Execute uses MCP servers, connectors, and APIs WELL — invoke them only when a native tool
  can't do the job, check credit before credit-gated calls, and engineer every prompt so a
  paid/generative call lands the best result on the FIRST try (no wasteful retries). Load before
  using any generative MCP (Higgsfield, Ideogram, image/video/audio/3D), any credit-gated tool, any
  Composio/connector action, or when writing a prompt for a sub-agent or an LLM API call. Pairs with
  memory/tool-credits.md (balances) and memory/tool-notes.md (per-tool gotchas).
---

# mcp-and-prompt-craft — use tools only when needed, prompt them so credit isn't wasted

Two disciplines: **(A) when to reach for an MCP/connector/API at all**, and **(B) how to prompt it
so a paid call succeeds first time**.

## A. MCP / connector / API discipline — necessity gate

Run this checklist BEFORE calling any MCP tool, connector, or external API:

1. **Can a native tool do it?** Read/Write/Edit/Bash/Grep/Glob, WebFetch/WebSearch, the browser
   (Playwright), `watch-video`, `crawl-site` cover most needs with zero credit. Only reach for an
   MCP when the native tool genuinely can't (e.g. generating a NEW image, an authenticated SaaS
   action). An MCP that duplicates a native capability is pure overhead — skip it.
2. **Is it credit-gated?** If yes, **check the balance first** (`memory/tool-credits.md`; for
   Higgsfield `show_plans_and_credits`/`balance`, Composio watch the 20K-calls/mo free tier). Plan
   the whole job against the budget before the first call. If the balance won't cover it, scaffold
   around it, leave a `TODO(credits)` + `SETUP-KEYS.md` row, tell the owner the exact shortfall.
3. **Is there a keyless fallback?** Prefer it when quality is comparable — curated stock (`crawl-site`
   / Pexels) over generative for real photography; the native browser over a paid scrape MCP.
4. **One good call, not speculation.** Never fire a generative/paid call to "see what happens." Get
   the prompt right (section B) first. Never retry a failed paid call without changing the input —
   a blind retry burns credit for the same failure.
5. **Least privilege on connectors.** Composio et al.: allowlist specific non-destructive tool IDs
   (skip `*_DELETE_*`/`*_SEND_*` unless the task needs them). Register at user scope, never commit
   keys (Claude Code can write literal keys into `.mcp.json` — see tool-notes).
6. **Unavailable == out of credits.** If an MCP is disconnected/unauthed, fall back (native tool,
   keyless path), don't block; note it in the `YOU DO:` list.

## B. Prompt craft — make the first call the good one

A generative call is money. Structure the prompt so you don't pay twice.

### Image (Ideogram, Higgsfield z_image/soul, etc.)
Build the prompt from these slots, in order — specific beats verbose:
1. **Subject** — the one concrete thing, with the detail that matters ("a weathered fisherman's
   hands mending a net", not "a person doing something").
2. **Composition / shot** — framing, angle, crop ("wide establishing shot, rule-of-thirds, subject
   left"), so the result drops into the layout slot you need.
3. **Style / medium** — "editorial photograph, 50mm, natural light" vs "flat vector illustration".
   Name a concrete visual register, not "beautiful/amazing" (adjectives the model can't act on).
4. **Palette / light / mood** — tie it to the brand ("warm forest greens, low golden light").
5. **Negatives** — always, for photoreal: `no text, no letters, no watermark, no logo, no extra
   fingers, no distorted hands`. (Dark "poster/title" prompts inject garbled text artifacts — say
   "plain scene, no implied text" and negate text hard. — memory/tool-notes.md)
6. **Quality/params** — set aspect ratio to the target slot, highest quality tier the budget allows,
   fixed seed if you need reproducibility.

Rules: describe what you WANT, not what you don't (except the negatives slot). No text baked into an
image unless the tool is known-good at typography (most aren't — overlay text in code/CSS instead).
For a set that must feel consistent, reuse one style sentence verbatim across all prompts + a fixed
seed. Generate at the size you'll use — upscaling a cheap small gen beats re-rolling a large one.

### Video / audio
Even pricier — storyboard in text first, get owner sign-off on the shot list, THEN generate. One
scene at a time, confirm before the next. Check the paid-plan gate (free Higgsfield can't do video —
tool-notes).

### Editing an existing asset
Prefer the dedicated edit tool over re-generating: upscale / outpaint / reframe / remove-background /
remix. Re-rolling a whole gen to change one thing wastes the whole gen's credit.

### Prompting a sub-agent (the Agent tool)
Same "first call is the good one" logic — a re-run is a whole agent's tokens.
- **One job, sharp scope.** State the ticket, the exact files, the definition of done, and the
  verification the agent must run itself (gates, tsc, build). Vague briefs cause re-work.
- **Give it the context it can't derive** — the relevant memory/skill to read, the gotcha to avoid,
  the branch, commit-per-green-unit + don't-push. Point to files; don't paste huge dumps.
- **Right model tier** (CLAUDE.md rule 2): research = Sonnet, build-greenfield = Sonnet,
  build-into-existing = Opus, planning/review = Fable. Never a bigger tier than the job needs.
- **Report contract**: tell it exactly what to report back (what changed, results, unresolved) so
  you don't spend a round asking.

### Prompting an LLM API you're building INTO a product
- Force structure where you can (tool_choice / JSON schema) and **re-validate server-side** — never
  trust model output as safe (see the an example app intake pattern: forced tool use + server clamp).
- Bound outputs (max_tokens), treat user/file content as DATA between markers, never as instructions.
- Pick the smallest model that does the job (narration = Haiku; hard comprehension = Opus).

## The one-line rule
Native tool if it exists → keyless fallback if quality allows → paid MCP only when necessary, budget
checked, prompted to land first try. A retry means the prompt was wrong, not the tool.
