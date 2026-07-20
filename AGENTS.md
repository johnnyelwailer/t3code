# AGENTS.md

## Git / PR Policy

**HARD RULE — NEVER target upstream `pingdotgg/t3code`.**

- **NEVER** open, update, merge, or create pull requests against upstream `pingdotgg/t3code` (or any `pingdotgg/*` upstream remote).
- All work stays on the user's fork and local branches (`origin`, feature branches).
- Only commit and push to the user's fork (`origin`) unless the user explicitly instructs otherwise.
- Closing mistaken upstream PRs is OK; creating or updating them is forbidden.

## Task Completion Requirements

- Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
  - Use `vp test run <test-files>` for focused built-in Vite+ tests. Use `vp run test` only when the affected package specifically requires its `test` script.
  - Backend changes must include and run focused tests for the changed behavior.
  - Run targeted formatting, lint, and type checks for the affected scope when available.
- Do not run repo-wide `vp check`, `vp run typecheck`, `vp run test`, or equivalent full-suite commands locally unless the user explicitly requests them. CI is responsible for the full verification suite.
- After frontend feature development or any user-visible frontend behavior change, the primary agent must run one integrated verification pass for each affected client surface after integrating the work:
  - Web: use the `test-t3-app` skill. Launch one isolated environment, authenticate through the printed pairing URL, and verify the affected flow in the controlled browser.
  - Mobile: use the `test-t3-mobile` skill. Connect one representative iOS Simulator or Android Emulator available on the host to one isolated environment and verify the affected flow. On compatible macOS hosts, prefer iOS for cross-platform changes and stream it through serve-sim in the T3 Code in-app browser or another available agent browser; use Android when it is the affected or viable platform.
  - Subagents must not independently launch dev servers or repeat integrated client verification unless their delegated task explicitly requires it.
  - Stop dev servers, watchers, and other long-running verification processes when the focused verification is complete.
- If changing native mobile code, `vp run lint:mobile` must also pass.
- For t3work additive/prefix-constrained tasks, agents MUST run `node t3work-additive-guard.mjs` after finishing code changes and before reporting completion. DO NOT CHANGE THE WHITELIST WITHOUT APPROVAL.
- The additive prefix guard is a blocking completion gate for those tasks: if it fails, the task is not complete.
- The guard caps prefixed (`t3work-*`) production files at **200 non-empty lines** (150 = warning); tests/fixtures/stories/`*.browser.*` get 600/300. This is a **design constraint to honor while writing**, not a formatting fix to do at the end — splitting a finished 1000-line file into compliant modules is expensive rework. Design modules under the cap from the start; when a file passes ~150 lines, split it _then_ into focused siblings (extract pure helpers, sub-components, hooks). A 400+-line file is a planning miss to catch in planning. A `PostToolUse` hook (`scripts/t3work-additive-fast-hook.mjs`, wired in `.claude/settings.json`) surfaces a live LOC warning the moment a new prefixed file crosses the cap — act on it immediately rather than waiting for the commit gate.

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

Keep files small and composable by default (see the 200-line cap under Task Completion Requirements). A large stateful component is a planning signal to decompose up front — a controller hook for state/effects plus presentational sub-components — not a monolith to split later.

## T3work MVP Constitution

When working on the t3work MVP docs, packages, or app surfaces, agents MUST follow the t3work engineering constitution:

- `docs/t3work-mvp/10-engineering-constitution.md`

In short: t3work work must reuse the existing T3 Code shell and UI as the baseline, keep additions isolated where possible, favor small composable code, target high-value 90-100% test coverage, provide Storybook and snapshot coverage for reusable UI and important screens, persist rich artifacts instead of chat-only output, and validate UI/workflow changes by opening the app in a browser and clicking through the changed flow end to end.

After completing a repeatable t3work workflow, agents should mention that the workflow could be saved as a project-scoped action recipe and offer to create it. Do not create recipes silently.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and client applications. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.
- `packages/client-runtime`: Shared runtime package for sharing client code across web and mobile.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `vpr sync:repos`; use `vpr sync:repos --repo <id>` to sync one configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.

## Session-learned gotchas (friction-optimizer, 2026-07-07)

- `vp run dev:desktop` hot-reloads **web + desktop only**; the backend runs from the prebuilt `apps/server/dist/bin.mjs`. After server-source changes: `pnpm -C apps/server build:bundle` + restart, or use `dev:server` for a watched backend. **New HTTP routes must be registered in BOTH registries** — `makeT3workRoutesLayer` _and_ the route-merge list in `server.ts`. Verify a new endpoint against the actually-running server/port before claiming done.
- Run vitest packages **serially** — full concurrent runs die with exit 137 (OOM SIGKILL). A 137 is a kill, not a test failure; re-run that package serially before triaging.
- Pre-commit hook duplicates lint/test; bypass with `--no-verify` only when test+typecheck already ran green in-session, and say so.
- Live testing = the **real user path**: never mint tokens, scan storage for credentials, or shim past auth/UI ("NO SHIMS"). If blocked, report the blocker.
- After `git push`, re-check `gh pr list --head <branch>` **before** `gh pr create` (a push can surface an existing PR).
- Upstream merges: use a **worktree**, `--no-commit`, resolve, serial regression matrix, then merge back. Known seam files: `ChatView.tsx`, `MessagesTimeline.tsx`. Hand-resolved merges are **consequential** → second-model review (Codex/Cursor/Copilot) queued _before_ final verification.
- Tempo/capacity rules: probe real Tempo plan data first — off-project time may be booked as ISSUE-type plans (e.g. INT-2), not non-issue plans.
- Upstream merges/syncs: follow the `merge-upstream` skill (`.claude/skills/merge-upstream/SKILL.md`) — worktree, seam files, guard, serial tests, review-before-finalize.
