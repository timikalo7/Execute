---
name: read-unfamiliar-code
description: >
  Understand a codebase you did not write — a dependency, an inherited project, an open-source repo —
  by reading its actual source instead of its README. Pulls the real upstream source with `opensrc`
  and maps it into a queryable call graph with `graphify`, then reads the specific files the graph
  points at. Use before changing an existing/inherited codebase (the Opus-tier case in CLAUDE.md
  rule 2), before depending on a library whose behaviour matters, when a README and the code
  disagree, or when an agent is about to guess at an API it has never read.
---

# read-unfamiliar-code — read the source, not the README

An agent asked to understand a library reads its README and its docs. Those describe what the author
*meant*; the code is what actually runs. The gap between them is where the wrong-API and
hallucinated-signature failures come from — and Execute has already paid for one (`memory/principles.md`:
fact-check AI-generated claims, never ship a hallucinated API).

Two commands close it:

1. **`opensrc`** — fetch the real upstream **source tree** of a package into a local cache. Not the
   published tarball with the types stripped and the comments minified: the actual GitHub repo the
   package was built from, at the version you depend on.
2. **`graphify`** — build a local call/containment graph of that tree so you get the 30,000-foot view
   first and know *which* twenty files out of two thousand matter, before you spend context reading.

Then read those files. The graph is the index, not the answer — never quote the graph as if it were
the code.

**Provenance:** the pairing came from a reel by `agentic.james` (Instagram `DaLg2dBjQah`, 2026-08-17).
Everything below was re-verified by running it in this container on 2026-08-17 — the star counts and
capability claims in the reel were NOT taken at face value. See the honest-limits section for the
parts that are still unproven here.

## Install

```bash
npm install -g opensrc          # Apache-2.0, vercel-labs/opensrc, zero runtime deps
uv tool install graphifyy       # Apache-2.0/MIT, Graphify-Labs/graphify — note the doubled 'y'
```

`graphifyy` is the real PyPI name (`graphify` on PyPI is unclaimed — 404 as of 2026-08-17, so don't
"correct" the spelling and don't let anyone talk you into installing the un-doubled name later; an
unclaimed name next to a popular tool is a squat waiting to happen).

## Step 1 — pull the real source

```bash
opensrc path zod                 # npm         -> ~/.opensrc/repos/github.com/colinhacks/zod/4.4.3
opensrc path pypi:requests       # PyPI        -> ~/.opensrc/repos/github.com/psf/requests/2.34.2
opensrc path crates:serde        # crates.io   -> ~/.opensrc/repos/github.com/serde-rs/serde/1.0.229
opensrc path owner/repo          # any GitHub repo (see the proxy note below)
opensrc list                     # what is already cached
```

It prints a path and nothing else, so it composes:

```bash
rg "class Retry" "$(opensrc path pypi:urllib3)"
cat "$(opensrc path zod)/packages/zod/src/index.ts"
```

**In THIS container you must clear `no_proxy` first.** The Rust binary cannot reach a registry on the
direct-egress path the environment's `no_proxy` puts `registry.npmjs.org` and `pypi.org` on; forcing it
through the agent proxy fixes it. Measured, not guessed:

```bash
opensrc path zod                     # Error: error sending request for url (https://registry.npmjs.org/zod)
no_proxy="" NO_PROXY="" opensrc path zod   # /root/.opensrc/repos/github.com/colinhacks/zod/4.4.3
```

`SSL_CERT_FILE` makes no difference — `no_proxy=""` alone is the fix. On the owner's own machine there
is no agent proxy and none of this applies.

## Step 2 — map it

```bash
graphify update <path-to-source>     # local AST extraction, no LLM, no API key, no network
```

Writes `<path>/graphify-out/`: `graph.json` (queryable), `GRAPH_REPORT.md` (read this first —
community hubs, "god nodes", surprising connections), `graph.html` (force-directed view for a human).

Measured on `projects/example-agent/scripts`: **16 files → 184 nodes, 438 edges, 10 communities in
2.05s, zero tokens.**

Point it at a *copy* when the tree is inside a repo you push — `graphify-out/` is generated noise and
does not belong in a commit unless the owner asks for it.

## Step 3 — query before you read

```bash
graphify explain "formReady"                       # a node, its file:line, and everything touching it
graphify path "brief" "answerBlocks"               # shortest call path between two symbols
graphify query "how does a brief get its answers"  # BFS from matched symbols — a candidate set, not prose
graphify diagnose multigraph                       # same-endpoint edge collapse risk in the graph itself
```

Then open the files it named and read them. That is the step the reel is actually about and the step
an impatient agent skips.

## Honest limits — the parts that are NOT proven

- **`opensrc path <owner/repo>` does not work in this container** and was NOT checked. It resolves via
  `api.github.com`, which the agent proxy gates to the session's own repositories — every owner/repo
  spec fails with `error sending request for url (https://api.github.com/repos/...)`, including
  in-scope ones. The npm/PyPI path is unaffected because that resolves through the registry and then
  clones from `github.com` directly. Expect owner/repo to work on the owner's machine; do not claim
  it works from here.
- **`graphify install` was deliberately NOT run.** It copies third-party skill files into assistant
  config directories (`claude`, `cursor`, `codex`, and ~15 others). That is a supply-chain action on
  the dev environment and it is the owner's to take, not Execute's (`memory/principles.md`:
  dev-environment = supply chain). The CLI does everything above without it.
- **Semantic extraction was NOT exercised.** Code extraction is fully local tree-sitter AST parsing
  and needs no key. Extracting from docs/PDFs/images/video needs an LLM backend key
  (Anthropic/OpenAI/Gemini/Bedrock/Ollama) and burns credits. Do not set one without asking.
- **Multiple call sites collapse into one edge.** `formReady()` reported degree 3 — but `applyOne()`
  calls it at both L594 and L695 and `selfTest()` at both L1092 and L1097. The graph gives you one
  edge per caller *function*, not per call site. Fine as an index, wrong as a census.
- **INFERRED edges are guesses and are labelled as such.** The an example agent project run was 98% EXTRACTED /
  2% INFERRED at average confidence 0.54. Verify an INFERRED edge in the source before you act on it.
- **`graphify explain` exits 0 on a node that does not exist** (it prints `No node matching 'X' found.`
  and returns success). `graphify path` correctly exits 1. Never branch a script on `explain`'s exit
  code — grep its output.

## What was proven, and how

Both directions, per CLAUDE.md rule 9 — a check only shown passing is not proven to work.

| Claim | Good input | Bad input |
|---|---|---|
| `opensrc` fetches real source | `opensrc path zod` → source tree with `packages/zod/src/index.ts`, exit 0 | `opensrc path this-package-does-not-exist-9f3a2` → `Error: Package "..." not found on npm`, **exit 1** |
| `opensrc` crosses ecosystems | `opensrc path pypi:requests` → `github.com/psf/requests/2.34.2`; `opensrc path crates:serde` → `github.com/serde-rs/serde/1.0.229` | — |
| `graphify` line numbers are real | `explain "formReady"` claimed `apply.mjs L810`, callers at L594 and L1092 — `grep -n formReady apply.mjs` confirms **all three exactly** | `explain "totallyFakeFunctionXyz"` → `No node matching ... found` |
| `graphify path` finds a true edge | `path "brief" "answerBlocks"` → 1 hop, EXTRACTED — and `cowork-brief.mjs:105` really does call it | `path "brief" "totallyFakeFunctionXyz"` → not found, **exit 1** |

## When NOT to use this

- A small file you can just read. The graph is for trees too big to hold in context, not for six files.
- A library whose docs are the authority (a public HTTP API's spec, a paid service's contract). Read
  the source when behaviour matters; read the docs when the contract matters.
- Anything where you would be reading code you have no right to read. `opensrc` fetches public
  registries and public repos; keep it there.
