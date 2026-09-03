# RTK (Rust Token Killer) — vendored hook, and how to actually turn it on

Upstream: **https://github.com/rtk-ai/rtk** — Apache-2.0 (see `LICENSE-rtk`). A single Rust binary,
zero runtime dependencies, that compresses noisy command output *before it reaches the model's
context*: 60–90% fewer tokens on common dev commands (test runners, `git status`/`log`/`diff`, `ls`,
`grep`, `find`). The author measured ~10M tokens (~89%) saved over two weeks.

## What was vendored
- `rtk-rewrite.sh` — the upstream Claude Code `PreToolUse` hook, **unmodified**. It shells out to
  `rtk rewrite`, which is the single source of truth for rewrite rules (the Rust registry).
- `rtk-awareness.md` — upstream's short CLAUDE.md snippet.
- `test-rtk-rewrite.sh` — upstream's 60+ assertion test suite for the hook.

**Not vendored / not run:** the `rtk` binary itself, `install.sh`, the Rust source, and the hooks for
other agents (cursor, codex, copilot, windsurf…). Per Execute's supply-chain rule the installer was
read and audited but not executed here — it downloads a GitHub release tarball, verifies
`checksums.txt`, guards against path traversal in the tar, and installs to a bin dir. It is
well-behaved; it simply has no lasting effect in an ephemeral container.

## Why it is currently a no-op
`rtk-compress.sh` (the Execute wrapper, registered as a `PreToolUse` hook) exits silently unless both
`rtk` and `jq` are on `PATH`. This cloud container is rebuilt every turn and does not ship `rtk`, so
today the hook costs nothing and does nothing. The wrapper exists so that the moment `rtk` is
present, compression turns on with no further edits.

## Turning it on (owner-side, one time)
`rtk` must exist on `PATH` **at session start**. Add it to the environment's setup script (Claude
Code on the web → environment settings → setup script), or install it on any machine where you run
Claude Code locally:

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
rtk gain    # MUST print the savings dashboard — that confirms the correct rtk
```

⚠️ **Name collision:** there is an unrelated crate also called `rtk` ("Rust Type Kit").
`cargo install rtk` may fetch the wrong one. Always verify with `rtk gain`; if that command is not
found, you have the wrong binary. `jq` is also required (already present in this container).

Once installed, `rtk gain` shows cumulative token savings.

## Interaction with the Execute pre-push gate — do not break this
RTK rewrites `git push` into `rtk git push`. Execute's `pre-push-guard.sh` detects pushes by regex,
and originally required `git` at the start of a command or right after a separator — the wrapped
form would have slipped straight past it and the pre-push gate would have **silently stopped
firing**. That is textbook evaluator decay (`memory/agent-graph-engineering.md` §5): a checker that
quietly stops checking while everything still looks green.

The guard now tolerates one optional wrapper token before `git`, and that behaviour is covered by
explicit match/no-match cases. **Do not narrow that regex.** Over-matching is the safe direction: a
needless gate run costs seconds; a missed one ships unaudited code.

## Verifying the hook after enabling rtk
```bash
bash .claude/hooks/vendor/rtk/test-rtk-rewrite.sh   # upstream suite, needs rtk + jq
```
