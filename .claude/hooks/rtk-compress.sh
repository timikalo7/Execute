#!/usr/bin/env bash
# Execute wrapper around RTK's PreToolUse hook (vendor/rtk/rtk-rewrite.sh, Apache-2.0).
#
# RTK (https://github.com/rtk-ai/rtk) is a CLI proxy that compresses noisy command output before it
# reaches the model's context — 60–90% fewer tokens on common dev commands (cargo/pytest/jest test
# output, git status/log/diff, ls, grep, find). It works by rewriting the Bash command to an `rtk`
# equivalent via this PreToolUse hook.
#
# Why the wrapper: the vendored upstream hook prints a WARNING to stderr on EVERY Bash call when
# `rtk` or `jq` is missing. This container is ephemeral and does not ship rtk, so unwrapped it would
# spam every command. This wrapper stays completely silent unless rtk AND jq are both present, at
# which point it delegates to the untouched upstream hook.
#
# To actually get the savings, `rtk` must exist on PATH at session start — add it to the
# environment's setup script (see .claude/hooks/vendor/rtk/README-execute.md). Until then this is a
# no-op and costs nothing.
#
# NOTE: RTK rewrites `git push` into `rtk git push`. pre-push-guard.sh explicitly tolerates one
# wrapper token before `git` so the Execute pre-push gate still fires on the rewritten form — do not
# narrow that regex (memory/agent-graph-engineering.md §5, check the checker).

command -v rtk >/dev/null 2>&1 || exit 0
command -v jq  >/dev/null 2>&1 || exit 0

exec bash "$(dirname "$0")/vendor/rtk/rtk-rewrite.sh"
