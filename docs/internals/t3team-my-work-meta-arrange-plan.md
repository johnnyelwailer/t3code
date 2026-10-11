# My Work meta-arrange

"Arrange for me" becomes a meta recipe launched from the sidebar surface
`project.dashboard.myWork`. It interviews the user, shapes a draft on the real board until the
user keeps it, then saves and starts a recipe that keeps the arrangement current.

The foundation is keyed by view surface. My Work is the first and only caller. No other
surface is designed for here.

## Integration points

- **Arrangement API.** `t3team.mywork.arrange` (`t3team-toolBrokerMyWorkHandlers.ts`) and the
  HTTP routes in `t3team-myworkDigestArrangement-routes.ts`. Both already wrote one live plan
  per viewer and scope.
- **Board.** `ProjectMyWorkDigestView` renders `DigestArrangementBar` for a live agent
  arrangement. A pending draft swaps it for `DigestDraftBar` (Keep / Discard) in the same slot.
- **Launch.** `ProjectDashboardKickoffAside` already lists recipes for
  `project.dashboard.myWork`. The fixture toolbar's "Arrange for me" button is a story state
  machine and is not the launch path.

## Scope

The recipe engine discovers recipes only under `<workspace>/.t3team/recipes/` and pack roots,
and `defineRecipe` accepts only `scope: "project"`. There is no user-global recipe scope.

The interview offers the two digest scopes that exist: this project (`project:<id>`) or all
projects (`all`). The generated recipe file is always project-scoped. When the user picks all
projects, its workflow passes `scope: "all"` to the My Work tools, which read and write the
viewer's cross-project digest from a project thread. A recipe that follows the user across
workspaces needs a user-pack discovery root and is a follow-up.

## Draft channel

The generic store `t3team-viewArrangement.ts` holds table
`t3team_view_arrangement(surface, provider, account_id, scope, channel, plan_json)`, where
channel is `live` or `draft`. Plan JSON is opaque there; the surface validates before store.

My Work's adapter (`t3team-myworkDigestArrangementDraft.ts`):

- `channel: "draft"` stores the draft. Live writes go to the generic row and are mirrored to
  the legacy `t3team_digest_arrangement` table so older readers keep working.
- Promote copies the draft to live and deletes it. Discard deletes the draft. Reset clears
  live (both tables) and draft.
- The digest payload gains `draftArrangement`. It is part of the poll fingerprint, so the next
  poll paints it. The client renders `draftArrangement ?? arrangement ?? heuristic` through
  `resolveDigestPlan`: refs only, facts from the current graph. No model call on refresh.

## Widget sections

Section kind `widget` carries `widgetHtml` (max 8,000 characters) and no ticket or review refs.
`digestWidgetHtmlIssues` (contracts) rejects markup that reaches a network (URLs, `fetch`,
`XMLHttpRequest`, `WebSocket`, `<script src>`, `<link href>`, `<iframe>`, `<object>`,
`<embed>`); the server refuses the write and the client refuses to render.

`buildViewWidgetSrcdoc` is surface-agnostic. It renders a sandboxed iframe (`allow-scripts`, no
tool bridge) with the thread-widget CSP (`connect-src 'none'`), the host theme, and a frozen
`window.viewData`. My Work passes a snapshot of up to 40 tickets and 40 reviews. A graph
refresh re-injects the snapshot without calling the agent.

## Recipe generation

`t3team.mywork.arrange` gains a `recipe` mode beside `plan`, `reset`, `promote`, and
`discardDraft` (exactly one per call). The spec is structured (id, title, focus, noise,
density, digest scope, cadence), never free-form source.

- `renderViewRecipe` (generic) emits `recipe.ts` and `<id>.workflow.ts`. User text enters only
  as `JSON.stringify` literals. The surface id and the read call are allowlisted by pattern.
- The workflow reads the view with one tool call and signs it (My Work: sorted ticket ids). It
  calls `agent()` only when 25% or more of the signature changed, then parks on
  `waitUntil(now() + everyHours)`. It runs at most 48 passes, so it ends on its own.
- The signature and drift helpers ship as self-contained JS source, because the workflow loader
  binds no imports.
- `writeViewRecipe` writes through Effect `FileSystem` into the launching project's recipes
  root and returns the workspace-relative `workflowPath` that `t3team.orchestration.run`
  takes.

## Meta recipe

Copy-ready sources; landing them in the distribution pack is a separate change:

- `docs/t3team-mvp/recipes/my-work-arrange-meta/recipe.ts`
- `docs/t3team-mvp/recipes/my-work-arrange-meta/workflow.ts`

Id `my-work-arrange-meta`, surface `project.dashboard.myWork`, slash alias `arrange-meta`, tool
groups `integration.read`, `view.state`, `thread.handoff`. The workflow:

1. Asks for scope, focus, noise, density, and cadence (`askUser` with schemas).
2. Has an agent store a draft. The board shows it. Asks keep, revise, or discard; a revision
   re-drafts with the feedback (at most 8 rounds).
3. On keep: promotes the draft, writes the maintain recipe, and launches it with
   `t3team.orchestration.run`.

## Performance

- Draft and live plans are refs. Every poll re-resolves them locally.
- Widget data is a bounded snapshot posted into the iframe; no tool bridge, no network.
- The maintain loop wakes the agent only on drift.

## Files

| Concern                       | Files (`apps/server/src` unless noted)                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic store                 | `t3team-viewArrangement.ts`                                                                                                                                                                                      |
| My Work draft adapter         | `t3team-myworkDigestArrangementDraft.ts`, `t3team-myworkArrangeMode.ts`                                                                                                                                          |
| HTTP                          | `t3team-myworkDigestArrangement-routes.ts` (reset, promote, discard)                                                                                                                                             |
| Recipe generation             | `t3team-viewRecipeTemplate.ts`, `t3team-viewRecipeWrite.ts`, `t3team-myworkArrangeRecipe{Spec,Template,Write}.ts`, `t3team-myworkArrangeDrift.ts`                                                                |
| Schema                        | `packages/contracts/src/t3team-myworkArrangement.ts`                                                                                                                                                             |
| Board (`apps/web/src/t3team`) | `t3team-viewWidgetSrcdoc.ts`, `t3team-myworkDigestWidgetSrcdoc.ts`, `t3team-ProjectMyWorkDigestWidgetSection.tsx`, `t3team-ProjectMyWorkDigestDraftBar.tsx`, `mywork-digest/t3team-useDigestArrangementDraft.ts` |
