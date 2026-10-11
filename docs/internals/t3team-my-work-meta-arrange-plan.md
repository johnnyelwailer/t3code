# My Work meta-arrange

The live digest on this pin (`fbfd46ea13`) already stores an agent arrangement and renders it.
This change adds a draft overlay, agent-authored sections, and a recipe the sidebar can launch.
It does not rebuild the digest graph.

## What was already here

Searched this worktree (the vendor pin of the running app) for a draft channel, a custom widget
kind, and a recipe writer. None of those exist. The pieces to extend:

- Arrangement store: `apps/server/src/t3team-myworkDigestArrangement.ts` (one live plan per
  viewer + scope, table `t3team_digest_arrangement`).
- Wire schema: `packages/contracts/src/t3team-myworkArrangement.ts` (kinds `items` / `reviews` /
  `graph`).
- Widget shells: `apps/web/src/t3team/t3team-dashboardWidgetRegistry.tsx`.
- Thread-widget CSP: `apps/web/src/t3team/chat/t3team-widgetSrcdoc.ts` (`connect-src 'none'`).
- Recipe discovery: `apps/server/src/t3team-projectRecipeDiscovery.ts` reads
  `<workspace>/.t3team/recipes/*/recipe.ts` and pack roots. `defineRecipe` accepts only
  `scope: "project"` (`packages/t3team-sdk/src/t3team-sdk.recipe.ts`).
- Sidebar: `apps/web/src/t3team/t3team-ProjectDashboardKickoffAside.tsx` already lists recipes
  for `project.dashboard.myWork` when the dashboard mode is My Work.
- Agent write: `t3team.mywork.arrange` in `apps/server/src/t3team-toolBrokerMyWorkHandlers.ts`.

The research thread audited an older `origin/main` and reported the Arrange button as
Storybook-only. On this pin the digest graph is server data, and the live view shows
`DigestArrangementBar`. The toolbar's "Arrange for me" button is still the fixture state
machine. Launch stays on the existing sidebar surface.

## Scope choice

The recipe engine has no user-global recipe scope. Adding one would be a new discovery root.
The interview instead offers two digest scopes that already exist:

- `project:<appProjectId>` — this project's digest.
- `all` — the viewer's cross-project digest.

The generated recipe file is always project-scoped, written under the launching project's
`.t3team/recipes/`. Its workflow passes `scope: "all"` when the user picked every project.
A recipe that follows the user across workspaces (a user pack) is a follow-up, not this change.

## Draft channel

A second table, `t3team_digest_arrangement_draft`, same key as the live row. `CREATE TABLE IF
NOT EXISTS` cannot add a column to the live table, so the draft is its own table.

- Store with `t3team.mywork.arrange` and `channel: "draft"`.
- The digest payload gains `draftArrangement`. It is part of the poll fingerprint, so the next
  graph poll paints it. Resolving the plan stays `resolveDigestPlan` (refs only, facts from the
  current graph). No model call on refresh.
- Promote copies the draft into the live row and deletes the draft.
- Discard deletes the draft. Reset (back to default) clears the live row and the draft.

The digest view prefers `draftArrangement` over `arrangement` and shows a draft bar
(keep / discard). The fixture toolbar gains a `draft` state for stories.

## Widget sections

Section kind `widget` carries `widgetHtml` (max 8_000 characters) and no ticket or review refs.
The server rejects markup that names a network (`http:`, `fetch`, `WebSocket`, external
`<script src>`, iframes). The board renders it in a sandboxed iframe (`allow-scripts`, no
tool bridge) with the same CSP as thread widgets, plus a frozen `window.digest` snapshot of
graph facts. A graph refresh re-injects the snapshot; the agent is not called.

## Recipe the meta workflow writes

`t3team.mywork.arrange` grows one more exclusive mode, `recipe`, beside `plan`, `reset`,
`promote`, and `discardDraft`. The writer (`t3team-myworkArrangeRecipeWrite.ts`) emits
`recipe.ts` + `workflow.ts` from a fixed template. Interview strings are inserted only as
`JSON.stringify` literals. The generated workflow reads the digest with a tool call, and calls
`agent()` only when the ticket-id set drifts by 25% or more, then parks on `waitUntil`.

From a project thread, `scope: "all"` on the My Work tools reads and writes the viewer's
all-projects digest. A different project's id is still refused.

## Meta recipe

Copy-ready sources (pack landing is separate):

- `docs/t3team-mvp/recipes/my-work-arrange-meta/recipe.ts`
- `docs/t3team-mvp/recipes/my-work-arrange-meta/workflow.ts`

Id `my-work-arrange-meta`, surface `project.dashboard.myWork`, slash alias `arrange-meta`.
The workflow interviews (scope, focus, noise, density, cadence), asks the agent to store a
draft, then loops on keep / revise / discard. Keep promotes the draft, writes the maintain
recipe, and launches it with `t3team.orchestration.run` (`workflowPath`). Tool groups:
`integration.read`, `view.state`, `thread.handoff`.

## Files

| Concern | Files |
| --- | --- |
| Draft store | `t3team-myworkDigestArrangementDraft.ts` |
| Arrange modes | `t3team-myworkArrangeMode.ts` |
| Drift check | `t3team-myworkArrangeDrift.ts` |
| Recipe writer | `t3team-myworkArrangeRecipeSpec.ts`, `t3team-myworkArrangeRecipeTemplate.ts`, `t3team-myworkArrangeRecipeWrite.ts` |
| Schema | `packages/contracts/src/t3team-myworkArrangement.ts` |
| Board | `t3team-myworkDigestWidgetSrcdoc.ts`, `t3team-ProjectMyWorkDigestWidgetSection.tsx`, `t3team-ProjectMyWorkDigestDraftBar.tsx` |
| HTTP | promote + discard routes next to arrangement reset |
