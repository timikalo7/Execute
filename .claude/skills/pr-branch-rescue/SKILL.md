---
name: pr-branch-rescue
description: Rescue a stale/long-diverged PR or feature branch by merging the moved-on base branch into it without losing either line's work. Use when a PR has sat while main advanced (conflicting gates, security fixes, or redesigns on both sides), when asked to "rebase", "un-rot", "bring up to date", or "rescue" a branch, or when a merge shows many conflicts across unrelated file classes. Covers trial-merge conflict inventory, conflict triage by lineage, re-applying clobbered fixes, and full gate re-verification of the merged tree.
---

# Rescue a stale PR branch

A long-diverged branch is not resolved file-by-file ad hoc — that thrashes and silently drops one
side's work. Inventory first, decide rules per *class* of file, then resolve mechanically, then
re-verify everything as if the merged tree were new code.

## 1. Sync and trial-merge for the inventory

- `git fetch origin`; work on the PR branch (or an integration copy of it).
- `git merge origin/<base> --no-commit --no-ff` — do NOT start resolving. The point is the full
  conflict list in one shot: `git diff --name-only --diff-filter=U`.
- Record the list. If the merge is hopeless, `git merge --abort` costs nothing.

## 2. Triage conflicts by lineage, not one at a time

Classify every conflicted path by which line of development *owns* it, and set the rule per class
before touching a file:

- **Meta / config / CI / gates / hooks** — owned by the base branch (that's where process evolved).
  Take the base's side: `git checkout --theirs -- <path>` (or `--ours`, depending on merge
  direction — verify with `git log` which side actually advanced the file).
- **Append-only knowledge files** (logs, changelogs, memory/notes) — union both sides, ordered
  chronologically. Never pick a side; both histories are real.
- **Product surfaces the branch actively evolved** (the reason the PR exists) — keep the branch's
  newer work, then re-apply the base's *targeted* fixes by hand (step 3). Blind `--ours` here
  silently reverts the base's security/a11y/bug fixes.

Resolve each class mechanically once its rule is set. Commit the resolution as its own unit.

## 3. Re-apply cross-cutting fixes the kept side clobbered

For every file where you kept the branch's version, check what the base changed there and why:
`git log --oneline <merge-base>..origin/<base> -- <path>`. Security patches, accessibility fixes,
and API-pattern migrations (e.g. an auth-verification pattern adopted on the base) must be
re-applied to the branch's newer code by hand. This is the step ad-hoc merges skip.

## 4. Invalidate every cached pass — re-run all gates on the merged tree

- Treat every pre-existing gate stamp / pass marker as stale: a stamp is evidence only if its
  recorded tree-hash matches the current tree. Presence means nothing — a stamp carried over from
  either parent will happily mask unfinished or regressed work.
- Re-run the full gate set (build, tests, a11y sweep, security scan, design/system gates — whatever
  the repo enforces) on the merged tree. Expect regressions even if both parents passed alone:
  merged composition is new code. (On the motivating case, a "finished" design carried 73 serious
  axe violations reintroduced by branch iterations.)

## 5. Security-review the merged surface

If the branch adds/changes any backend, auth, API, or data surface, run a reasoning security review
of the *merged* result — each side passing separately does not compose (e.g. branch routes must
adopt the base's newer identity-verification pattern, not their pre-divergence one). A read-only
review can run in parallel with other work on the same checkout; only concurrent *writers* race.

## 6. Ship discipline

- Commit per resolved unit throughout — a rescue interrupted mid-way must be resumable from the
  last class, not restarted.
- Log the merge decisions (which class took which side, which fixes were re-applied) in the
  project's log/changelog so the next integrator inherits the rationale.

Reference example (optional): the 2026-07-07 PR #2 integration in this repo —
`memory/postmortems/2026-07-07-pr2-integration.md`.
