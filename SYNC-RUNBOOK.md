# Upstream sync runbook — branch `sync/upstream-20260917`

## Mission
Complete the t3code upstream sync that is **mid-merge** in this worktree. Upstream
(`pingdotgg/t3code`) is 527 commits ahead; the `--no-commit` merge produced 113
conflicted files. Your job: resolve all conflicts, install, verify (guard + typecheck
+ serial tests), and leave the merge **committed in this worktree only**. You do NOT
push and you do NOT merge back to main — the coordinator reviews the core resolutions
and merges back.

## Ground rules (non-negotiable)
- **Work ONLY in `/tmp/upstream-sync`.** Every git/pnpm/test command: `cd /tmp/upstream-sync` first.
  Never touch the user's main checkout (`/Users/pj/Dev/github/nexi-distribution/nexi-work/t3code`).
- **NEVER push to `upstream`** (its push remote is disabled on purpose). Never override it.
- **NEVER `git push` the sync branch and NEVER merge to `main`.** Committing the merge result in
  this worktree is fine; pushing/merging back is the coordinator's step.
- **git binary**: `/usr/bin/git` is BROKEN on this host. Always use
  `export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"` (git 2.54.0).
- **Memory discipline** (this machine OOM'd at 20GB before): run package test suites
  **serially, one at a time** (`pnpm -C packages/shared test`, then web, then server — never
  concurrent). A process dying with exit 137 is an OOM KILL, not a test failure — re-run that
  package alone before triaging it. Keep commands bounded; don't dump huge diffs to a file and
  cat it.

## Current state (updated 2026-09-17 ~15:25)
- Branch `sync/upstream-20260917`, `MERGE_HEAD` set (mid-merge). Base = fork main `bf228d9ca`;
  upstream/main = `1ab2dfb5a`; merge-base `e5d086c26`.
- **All 113 conflicts are already RESOLVED and staged** (0 unmerged files; `git add -A` done).
- **`node_modules` already installed** (5.2G). Do NOT re-resolve or re-install.
- A prior child (provider limit exhausted) did the resolution + install but died before
  verification. **Remaining work = the Verification + Finalize + Report sections below.**

## The fork's additive contract (what "correct" looks like)
This fork keeps t3team **additive**: new `t3team-*`/`t3team.` prefixed files + a
guard-whitelisted set of modified upstream files. When resolving:
- For a file upstream changed AND we changed: the goal is **upstream's new shape + our t3team
  extension points re-applied on top**. Read both sides (`git show :2:<path>` = ours/fork,
  `:3:<path>` = theirs/upstream; `:1:` = base). Re-apply our additive bits onto upstream's new
  structure rather than taking one side wholesale.
- t3team-only files we added (t3team-*): keep ours. Upstream-only new files: take theirs.
- **Guard**: `node t3team-additive-guard.mjs` must pass, OR show only the pre-existing
  violations (compare against a baseline captured on fork main — see step 5).

## Resolution order
1. **Event-sourced core (highest care)** — resolve with the most scrutiny; flag each for the
   coordinator's review in your report:
   `apps/server/src/orchestration/decider.ts`, `.../projector.ts`,
   `.../Layers/OrchestrationEngine.ts`, `.../Layers/ProjectionPipeline.ts`,
   `.../Layers/ProviderCommandReactor.ts`, `.../Layers/ProviderRuntimeIngestion.ts`,
   `.../Normalizer.ts`, `.../ThreadSettlementReactor.ts`, `.../Services/ProjectionSnapshotQuery.ts`,
   `apps/server/src/persistence/Migrations.ts`, `.../persistence/Layers/ProjectionThreads.ts`,
   `.../persistence/Layers/ProjectionThreadMessages.ts`.
   If a core conflict needs a genuine judgment call (not a mechanical re-apply), STOP and note it
   in your report — do not silently guess.
2. **Seam files**: `apps/web/src/components/ChatView.tsx`,
   `apps/web/src/components/chat/MessagesTimeline.tsx` — same re-apply-extension principle.
3. **Everything else** (providers, pullRequest, vcs, web components, contracts, client-runtime,
   desktop, mobile, AGENTS.md, .gitignore, .github) — resolve per the additive contract.
4. **Deps last**: `package.json` (root + all apps/packages), `pnpm-lock.yaml`,
   `pnpm-workspace.yaml`. These usually take upstream's new dependency versions; reconcile any
   fork-specific additions (e.g. t3team workspaces/packs the fork adds).

## Verification (all must be green before you report "done")
1. `git add -A` (stage all resolutions). No unmerged files remain:
   `git status --short | grep -cE '^(UU|AA|DU|UD|AU|UA)'` → 0.
2. `pnpm install` (dependency set changed). If it fails on a workspace/pack path, note it.
3. **Guard baseline first**: capture pre-merge findings on a clean `origin/main` checkout in a
   throwaway dir, then run `node t3team-additive-guard.mjs` on the resolved tree and diff —
   report only NEW findings.
4. **Typecheck**: `pnpm -C apps/server typecheck` and `pnpm -C apps/web typecheck` (and
   `packages/*` if they have typecheck). Note pre-existing errors vs new ones.
5. **Serial regression matrix**: run each affected package's vitest **one at a time**:
   `pnpm -C packages/shared test`, `pnpm -C packages/contracts test`,
   `pnpm -C packages/client-runtime test`, `pnpm -C apps/server test`, `pnpm -C apps/web test`.
   For a **failing** test, first re-run it on the pre-merge `origin/main` base to tell pre-existing
   failure from merge regression (skill step 7). Only report merge regressions as blockers.

## Finalize (only when green)
- `git commit` the merge (this finalizes the `--no-commit` merge in the worktree). Message:
  `sync: merge upstream/main (1ab2dfb5a) into fork main (bf228d9ca)`.
- Do NOT push. Do NOT open a PR. Leave the committed merge on `sync/upstream-20260917`.

## Report back (send to the parent thread when completely done, or on a hard blocker)
- Conflict count resolved (113 → 0 confirmed).
- Per-package test pass/fail counts (serial run).
- Guard status: new findings vs baseline (list any).
- Typecheck status per package; pre-existing vs new errors.
- **Core-file resolutions needing review**: for each core file in step 1, one line on what you
  did (which side won, what t3team extension was re-applied).
- Pre-existing-failure list (failures that also fail on pre-merge main).
- Anything you were unsure of and how you handled it.

## Last resort
If the merge becomes unresolvable, `git merge --abort` restores the clean fork-main tree, then
report the blocker. Don't abort without telling the coordinator why.
