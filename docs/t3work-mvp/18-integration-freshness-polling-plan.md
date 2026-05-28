# Epic 18: Integration Freshness Polling Plan

## Position

`t3work` needs fresher GitHub and Jira data without violating the additive constraints in
the constitution.

The first rollout should avoid non-`t3work` files and avoid introducing new core server
or websocket seams. That means polling first, through existing `t3work` backend routes,
with strong test coverage around freshness logic and cache behavior.

## Constitution Constraints

This plan follows [Engineering Constitution](./10-engineering-constitution.md):

- keep the first rollout additive
- prefer small composable modules
- keep integration traffic behind the backend boundary
- avoid broad edits to the existing T3 Code shell
- target high coverage on meaningful behavior

Initial file boundary rule:

- allowed: `docs/t3work-mvp/**`
- allowed: `apps/web/src/t3work/**`
- allowed when needed later: `apps/server/src/t3work-*.ts`
- allowed when needed later: `packages/integrations-atlassian/src/provider.ts`
- not in phase 1 without explicit follow-up approval: core files such as `apps/server/src/server.ts`, `apps/server/src/ws.ts`, or other non-`t3work` runtime seams

## Why Polling First

Polling first is the fastest path that stays inside additive boundaries.

It works with the current architecture:

- browser UI already calls `t3work` backend routes
- backend routes already own third-party access
- GitHub and Jira read surfaces already exist in `t3work` hooks
- the main missing behavior is freshness, not initial data access

This gives us user-visible freshness now, while leaving room for a later server-owned sync
loop if we decide an additive seam is worth adding.

## Relationship to the Queryable Cache Model

The cache this plan refreshes is the same local SQL store defined in
[Epic 04 — Caching](./04-integration-platform.md#caching) and consumed by the
`Queryable<T>` contract in [Epic 16](./16-action-recipes.md#context-reactive-queryable-surface).
Polling lands fresh provider data into the SQL tables; the existing projection pipeline
invalidates downstream subscribers (recipe discovery, Views, open workflow `collect-input`
steps). A future server-owned sync loop swaps the _trigger_ of these writes (push instead
of pull) without changing the cache shape or the consumer contract.

## Phase 1: Additive Client Polling

Deliverables:

- shared `t3work` polling/freshness helper in `apps/web/src/t3work/hooks`
- cache max-age support in the `t3work` integration cache
- periodic refresh in GitHub activity hook
- periodic refresh in Jira resource list hook
- focused unit tests for freshness math and cache expiry behavior

Rules:

- use existing `t3work` HTTP endpoints only
- do not call third-party APIs from browser code
- do not add new non-`t3work` subscriptions or runtime layers
- poll only while the page is visible and online
- prefer stale-while-refresh behavior over blanking the UI

Validation:

- cached data renders immediately when present
- stale cache refreshes as soon as the page is visible
- visible tabs refresh GitHub and Jira views on a steady cadence
- hidden tabs do not continue polling
- tests cover the cache freshness and poll scheduling rules

## Phase 2: Route Efficiency Inside Existing `t3work` Files

Deliverables:

- GitHub route-level conditional fetch improvements inside `apps/server/src/t3work-github-*.ts`
- Jira delta-oriented list helper inside `packages/integrations-atlassian/src/provider.ts`
- optional response metadata for next recommended poll cadence if the `t3work` routes need it

Goals:

- reduce repeated third-party reads while keeping the same browser contract
- keep route and provider changes limited to `t3work`-owned integration files
- preserve the browser polling surface from phase 1

Validation:

- GitHub polling avoids unnecessary full re-hydration when upstream state is unchanged
- Jira list reads can advance from an updated cursor with overlap and dedupe
- tests cover normalization, pagination, and stale-cache recovery paths

## Phase 3: Server-Owned Sync After An Approved Additive Seam

Deliverables:

- a dedicated `t3work` sync service on the server
- normalized change events for integration invalidation
- browser invalidation instead of per-view polling

This phase is intentionally deferred because it likely requires a new runtime seam that is
not currently isolated to `t3work` files.

We should only take this step when one of these becomes true:

- polling load proves meaningfully wasteful in practice
- we need cross-view shared freshness that browser polling cannot provide cleanly
- we approve a narrow additive server seam for `t3work` integration events

## Test Strategy

Coverage target for this work remains 90-100% on the new `t3work` helper modules.

Phase 1 test focus:

- cache freshness decisions
- stale cache expiry behavior
- next-poll scheduling math
- hook wiring only where the behavior can be tested without brittle browser fixtures

Phase 2 test focus:

- GitHub conditional request handling
- Jira delta paging and dedupe
- error mapping and fallback behavior

## Browser Validation

Every UI change from this plan still needs real-browser validation before the work is done.

Phase 1 browser checks:

- open a `t3work` project with GitHub activity and confirm it refreshes while visible
- open a Jira-backed project and confirm issue list refreshes while visible
- hide the tab or window, then re-focus and confirm refresh resumes
- verify stale cached views recover without manual reload
