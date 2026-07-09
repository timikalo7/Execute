#!/usr/bin/env bash
# tree-hash.sh <path…> — content hash of the given paths' CURRENT working-tree state, so a gate
# can tell whether a recorded pass still matches the tree being pushed. Hashes file CONTENT
# (tracked + untracked, ignoring .gitignore'd), not index state — so staging/committing the same
# bytes never changes the hash, while editing any byte does.
set -u
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
git ls-files -co --exclude-standard -- "$@" 2>/dev/null | LC_ALL=C sort -u | while IFS= read -r f; do
  [ -f "$f" ] && printf '%s %s\n' "$(git hash-object "$f" 2>/dev/null || echo unreadable)" "$f"
done | sha256sum | cut -d' ' -f1
