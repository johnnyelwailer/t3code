# AGENTS.md

## Task Completion Requirements

- `vp check` and `vp run typecheck` must pass before considering tasks completed.
  - If changing native mobile code, `vp run lint:mobile` must also pass.
- Use `vp test` for the built-in Vite+ test command and `vp run test` when you specifically need the `test` package script.
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
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `bun run sync:repos`; use `bun run sync:repos --repo <id>` to sync one
  configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.
