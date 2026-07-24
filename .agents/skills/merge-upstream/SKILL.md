---
name: merge-upstream
description: Merge/sync upstream (t3-chat) commits into this fork safely. Use when asked to "merge upstream", "sync upstream", run sync:upstream, or when the additive guard reports upstream drift/conflicts on whitelisted files.
---

# Upstream merge playbook (t3code fork)

Codified from session 280089ad (14-commit merge, improvised end-to-end) and the additive-guard architecture.

## Invariants

- This fork's contract: t3team code stays **additive** (`t3team-*` prefixed files, guard-whitelisted upstream files, ~200 added LOC/file). The guard: `node t3team-additive-guard.mjs`.
- Known conflict seam files: `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `pnpm-lock.yaml`.

## Steps

1. **Isolate**: create a worktree off the current feature branch — never merge in the user's checked-out tree.
2. **Fetch + inspect**: `git fetch upstream && git log --oneline HEAD..upstream/main` — count commits, scan for seam-file touches (`git diff --name-only HEAD...upstream/main | grep -E 'ChatView|MessagesTimeline|package.json|pnpm-lock'`).
3. **Merge without committing**: `bun run sync:upstream:current` (preferred — surfaces conflicts as standard git conflicts) or `git merge --no-commit upstream/main`.
4. **Resolve seams**: ours-side = t3team extension props/imports; upstream side may have restructured the same region — re-apply the t3team extension points onto the new upstream shape rather than picking a side wholesale.
5. **Guard**: `node t3team-additive-guard.mjs` must pass (or list only pre-existing violations — diff against its pre-merge output).
6. **Serial regression matrix**: run each package's vitest **serially** (`pnpm -C packages/shared test`, then web, then server…). Full concurrent runs die with exit 137 (OOM SIGKILL) — a 137 is a kill, not a failure; re-run that package alone.
7. **Triage failures**: before blaming the merge, re-run the failing test on the pre-merge HEAD — pre-existing failures get noted, not fixed in the merge.
8. **Review before finalize** (hand-resolved conflicts = consequential): run the `peer-review-fanout` recipe (≥2 providers) on the conflict resolutions — queue it BEFORE the final verification step so a session drop can't skip it.
9. **Receipts**: report per-package pass counts, guard status, seam files resolved, and pre-existing-failure list. Merge back to the feature branch only after green + review.
