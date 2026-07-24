# 33 — Server-Side Cache & localStorage Elimination

> Status: **Plan (awaiting approval)** — no code yet.
> Related: [04 — Integration Platform](04-integration-platform.md), [18 — Integration Freshness Polling](18-integration-freshness-polling-plan.md), [05 — Atlassian MVP](05-atlassian-mvp.md).

## 1. Problem

The web app caches **real domain data in the browser's `localStorage`** via a generic
`t3work-integrationCache` (localStorage + in-memory mirror). This violates the rule:

> **`localStorage` is only for settings / UI-view-state. It must never hold real data.**

Concrete failure that surfaced this: **My Work** (`useProjectResources`) hits Jira
**live on every poll** through a second, parallel `listResources` path that *bypasses the
existing SQLite cache entirely*, then mirrors the whole `ResourcePage` into `localStorage`.
The browser cache only exists because the server's fingerprint/`unchanged` poll protocol
omits the payload on a match — so the client is forced to keep its own copy.

**Confirmed root cause of the reported bug (silent truncation).** `listResources`
([provider.ts:704](../../packages/integrations-atlassian/src/provider.ts)) runs
`project = X AND assignee = currentUser() ORDER BY updated DESC` with a hard `limit ?? 50`,
then fetches the parents of those issues for context. A real cache dump showed a user with
>50 assigned issues: the payload was **exactly 50** assignee items + 34 parents. A parent
that made the top-50 (e.g. `IES-20032`) renders, but its assigned children that fell outside
the 50-most-recently-updated window (e.g. `IES-21014/21015`) are **never fetched** — so they
cannot appear under it. This is not a hierarchy bug (in this path issue `id` == Jira key, so
linking works); it is a capped, un-paginated live query. A paginated whole-project mirror
(this plan) removes the cap entirely.

Two structural problems:
1. **Two parallel Atlassian fetch paths.** The backlog has a proper SQLite cache
   (`t3work_atlassian_backlog_issues` + `t3work_atlassian_backlog_views`); My Work,
   board columns, accounts, projects, current-user, resource snapshots do **not** — they
   are live calls mirrored into `localStorage`.
2. **GitHub is entirely live + in-memory.** `gh api` calls behind short-TTL in-process
   `Map`s; nothing persisted; the client mirrors results into `localStorage`.

## 2. Target model — raw sync + projection (confirmed)

One **broad raw sync** per integration into SQLite, and each view is a **thin SQL
projection** over that raw data — exactly the pattern the backlog already implements:

- **Raw table** `t3work_atlassian_backlog_issues`: PK `(provider, account_id, external_project_id, issue_id)`, stores `resource_json`, indexed by `issue_key`. → the raw store.
- **View table** `t3work_atlassian_backlog_views`: per selection, an ordered `issue_ids_json` referencing the raw store + metadata + page cursor. → the optimized projection.
- **Sync walk** (`kickT3workAtlassianBacklogBackgroundSync`): paginates the provider in bounded bursts, upserts raw rows, and on completion **replaces** the view's id-list (prunes stale).
- **Cached response** (`readCachedT3workAtlassianBacklogResponse`): joins view + raw, returns payload with a `fingerprint` and a `source` of `live | persisted | stale-fallback`.

**Generalize this shape.** Every data cache becomes: *raw table(s)* + *view/projection
row(s) keyed by scope* + *fingerprint* + *(optional) background sync*. The client hook
reads the projection from the server and keeps **nothing** in `localStorage`.

Server becomes the single source of truth → multi-tab / multi-device consistency for free.

## 3. Inventory

### KEEP — legitimate `localStorage` (settings / UI-state)
Theme, panel widths/collapse, terminal layout, right-panel surface, composer drafts,
dashboard mode (`backlog`/`my-work`), backlog & my-work **view preferences** (query, sort,
group, visible columns, kanban lane customization), sidebar state, work mode, setup-profile
preference, thread-debug flag. ~19 files. **No change.**

> Note: the *preferences* for the My Work / Backlog dashboards stay local (they are UI
> state). Only the *data* those views render moves to the server.

### MUST-MOVE — `localStorage` caching real data

| Client cache | Backend method / endpoint | Server today | Scope | Existing SQLite |
|---|---|---|---|---|
| `useProjectResources` (My Work) | `pollResources` → `/atlassian/resources/poll` | **live Jira** | project + **currentUser** | ❌ |
| `projectBacklogCache` | `pollBacklog` → `/atlassian/backlog/*` | SQLite-backed | project + selection | ✅ (client mirror is redundant) |
| `atlassianResourceSnapshotCache` | `getResource` | live | per-resource | ❌ |
| `useProjectKanbanBoardColumns` | `getBoardColumns` → `/atlassian/board-columns` | live | project | ❌ |
| `useAtlassianCurrentUserDisplayName` | `listAccounts` → `/atlassian/accounts` | live | **global/user** | ❌ |
| `useCreateProjectAccountLoaders` | `listProjects` → `/atlassian/projects` | live | account | ❌ |
| `useCreateProjectLoadPersisted` | `listAccounts` + `listProjects` | live | global + account | ❌ |
| `useCreateProject` | `connectBasic/OAuth` + `listProjects` | live | global | ❌ |
| `useProjectGitHubActivity` | `pollInbox` → `/github/inbox/poll` | **live + in-memory Maps** | project-set | ❌ |
| `useGitHubRepositoryDiscovery` | `discoverInbox` → `/github/inbox` | **live + in-memory Maps** | project-set | ❌ |
| `CommandPalette` (GitHub) | `discoverInbox` | live | project-set | ❌ |

Only the backlog has a server cache; everything else is live + localStorage-mirrored.

## 4. Cross-cutting design decisions

1. **Identity scoping.** My Work is `assignee = currentUser()`. The raw store must carry
   enough to project per-user, OR sync resolves `currentUser` to an accountId and the view
   row is keyed by `(provider, account_id, external_project_id, viewer_account_id)`.
2. **Whole-project raw mirror (decided).** Instead of per-view syncs, mirror the **entire
   project** (all issues, all statuses) into the raw issues table. Every view — Backlog, My
   Work, Kanban — is then a pure **local SQL filter/projection** over that mirror, with no
   per-view Jira query. This is the superset that makes My Work (`assignee = me`, all
   statuses, + parents) a trivial local filter, and it is the model the incremental poll
   (below) keeps fresh cheaply. Today's backlog cursor-walk becomes the *initial backfill*
   of this mirror; the selection-scoped `backlog_views` rows remain as projections.
3. **Reference vs. live data → TTL projections.** Accounts/projects/board-columns/current-user
   are slow-changing reference data. They don't need a paging sync — a single cached row
   per scope with a `fetched_at` and a TTL (refresh-on-read-if-stale, return stale meanwhile)
   is enough. Reuse `isIntegrationCacheFresh` semantics, server-side.
4. **GitHub raw store.** Replace the 4 in-memory `Map`s (account 5m, repos 2m, inbox 45s,
   response 20s) with SQLite raw rows (repos, notifications, linked PRs) + a per-project-set
   projection. Keep TTL semantics as `fetched_at` columns; keep the fingerprint poll envelope.
5. **Fingerprint stays the contract.** Keep `toT3workPollResult` / `createT3workPollFingerprint`.
   The change is *where the payload lives when `unchanged`* — server SQLite, not the browser.
   On `unchanged` the client re-reads from the server projection (cheap, local SQLite), so
   the client never needs its own copy.
6. **Offline / stale-fallback.** The backlog cached-response already models
   `persisted | stale-fallback | live`. Adopt the same `source` tagging everywhere so the UI
   can show freshness.
7. **Guardrail.** Add a lint rule / wrapper so new code cannot put domain data in
   `localStorage` (e.g. restrict `localStorage` to an allowlisted settings module, or an
   ESLint `no-restricted-properties` on raw `window.localStorage` outside the settings layer).

8. **Freshness = incremental watermark poll (decided).** Realizes doc 18's deferred Phase 3
   (server-owned delta sync). The server keeps the whole-project mirror fresh by polling a
   few times per minute (only while a client is active for that project):

   ```
   project = X AND updated >= <watermark> ORDER BY updated ASC
   ```

   Upsert changed issues into the raw table, advance `watermark = max(updated)` seen. Views
   re-project locally; the existing fingerprint flips and clients re-read. The `updated >=`
   timestamp is the practical "head position" (Jira has no global changelog cursor). Use a
   small overlap window on the watermark to avoid missing same-timestamp edits, dedupe on
   `issue_id`. **Deletions/moves** (issues leaving the project) are *not* caught by
   `updated >=` — schedule a periodic full **reconcile walk** (e.g. every N minutes / on
   first open) that re-lists the project and prunes raw rows no longer present. Poll cadence
   and reconcile interval are config, paused when no client is watching the project.

9. **Rate-limit discipline (Atlassian/GitHub throttle quickly).** Hard constraint, not a
   nice-to-have:
   - **One shared sync per (provider, account, project)** on the server — never per client or
     per tab. N open tabs = 1 upstream poller. (The backlog sync already enforces this via
     `activeBacklogSyncs`.)
   - **Delta over full.** The watermark poll fetches only changed issues; full walks (initial
     backfill + reconcile) are bounded by per-burst budgets with pauses, like the existing
     `maxPagesPerBurst` / `burstPause` guard.
   - **No fixed silent caps.** The current `limit ?? 50` *is* the reported bug (§1) — paging
     replaces it; any residual bound must be logged, never silent.
   - **Honor `Retry-After` / 429 with backoff**; use conditional requests / ETags (GitHub)
     and the `updated` watermark (Jira) so unchanged data costs ~nothing.
   - **Pause when no client is watching** the project; back off cadence on hidden/offline tabs
     (carried over from doc 18).

## 5. Phased plan

Each phase is an independently shippable vertical slice. **Phase 1 is the trigger bug** and
establishes the reusable pattern; later phases reuse it.

### Phase 0 — Foundations
- Extract a reusable server helper set from the backlog cache: `rawUpsert`, `viewProjection`
  (ordered id-list join), `fingerprint`, `cachedResponse({source})`, `ensureTables`.
- Define a `T3workServerCache` convention doc section (table naming, scope keys, TTL columns).
- Add the `localStorage` guardrail (settings-only) — failing-but-allowlisted initially so the
  existing data caches still compile; tightened in Phase 7.
- **No user-visible change.**

### Phase 1 — Whole-project mirror + My Work projection (fixes the original bug)
- Promote the raw issues table to a **whole-project mirror**: initial backfill via the
  existing cursor walk (dropping the `statusCategory != Done` / selection scoping for the
  mirror), then keep fresh with the incremental `updated >=` watermark poll (decision 8).
  Add a periodic reconcile walk for deletions.
- Resolve `currentUser` → accountId; key the My-Work view row by viewer account.
- My-Work endpoint returns a **local projection** (`assignee = viewer` + parents) over the
  mirror, with fingerprint + `source` — no per-view Jira call.
- Build the **hierarchy server-side** over the raw store (resolve `parent.key`), so the
  client receives an already-linked tree — retires the client-side `ticketIdByParentRef`
  workaround in `t3work-ticketHierarchy.ts`.
- `useProjectResources`: read the projection from the server; **delete the `localStorage`
  cache** and the `v3` cache-key machinery.
- **Acceptance:** IES-21014 / IES-21015 nest under IES-20032 in My Work; no
  `t3work.integration-cache...listResources` key written; reload/multi-tab consistent;
  existing `t3work-projectMyWork.test.ts` cases still green (now exercising server output
  shape).

### Phase 2 — Backlog client mirror removal
- Server SQLite already exists; just have `projectBacklogCache` read the server cached
  response and **drop the `localStorage` mirror**. Lowest-risk slice.
- **Acceptance:** no backlog data in `localStorage`; backlog view unchanged for the user.

### Phase 3 — Reference caches (accounts, projects, board columns, current user)
- Small TTL-projection tables: `t3work_atlassian_accounts` (global/user),
  `t3work_atlassian_projects` (per account), `t3work_atlassian_board_columns` (per project),
  current-user folded into accounts.
- Endpoints refresh-on-stale, return stale meanwhile.
- Clients (`useCreateProject*`, `useProjectKanbanBoardColumns`,
  `useAtlassianCurrentUserDisplayName`) read server; drop `localStorage`.
- **Acceptance:** setup wizard + board columns + identity work with no domain data in
  `localStorage`; first paint may be served from a warm server cache.

### Phase 4 — GitHub raw store + projection
- New tables for repos / notifications / linked PRs + a per-project-set projection row with
  `fetched_at` TTL columns; keep the poll fingerprint envelope.
- Apply the same incremental-freshness idea where GitHub allows it (notifications carry
  `last_read_at` / `updated_at`; `gh api` conditional requests via ETag) instead of full
  re-hydration; full reconcile on a slower cadence.
- Replace the 4 in-memory Maps in `t3work-github-inbox-loader.ts` with SQLite reads/writes.
- `useProjectGitHubActivity` / `useGitHubRepositoryDiscovery` read server; drop `localStorage`.
- **Acceptance:** GitHub inbox/activity survives server restart; no GitHub data in
  `localStorage`; TTL behavior preserved.

### Phase 5 — Command palette index
- Build the palette's integration index from the server projections (Phase 1/4 outputs)
  instead of the client integration cache.
- **Acceptance:** palette populated without reading `localStorage` data caches.

### Phase 6 — Resource snapshot cache (`getResource`)
- Fold single-resource snapshots into the raw issues store (or a `t3work_atlassian_resource_snapshots`
  table) keyed per resource; drop `atlassianResourceSnapshotCache` `localStorage`.
- **Acceptance:** detail views read server snapshots; no snapshot data in `localStorage`.

### Phase 7 — Decommission & enforce
- Delete the data path of `t3work-integrationCache.ts` (keep only any settings use, if any —
  likely none → delete file).
- Tighten the Phase 0 guardrail to **hard-fail** any domain `localStorage` use.
- Sweep for orphaned cache keys / dead code; document the final contract in [04](04-integration-platform.md).
- **Acceptance:** `grep` shows `localStorage` only in the settings/UI-state allowlist; lint
  enforces it.

## 6. Sequencing & risk

- **Branch:** one explicit feature branch off `main`; phases land as commits on it, **not**
  a PR per phase.
- **Order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Phase 1 delivers the bug fix + the pattern;
  Phase 2 is a near-free win; 3/4 are the bulk; 5/6 are cleanup; 7 locks it in.
- **Highest risk:** Phase 1 whole-project mirror (initial backfill volume, watermark
  correctness, deletion reconcile) and Phase 4 (replacing battle-tested TTL Maps with SQLite
  without regressing latency).
- **Lowest risk:** Phase 2 (server cache already exists).
- Each phase is internally shippable; `localStorage` data caches that remain between phases
  are allowlisted, not deleted, until their phase lands.

## 7. Decisions & remaining open questions

**Decided:**
- Cache model: **raw sync + projection** (§2).
- Phase 1 raw scope: **whole-project mirror**, not per-view sync (§4.2).
- Freshness: **incremental `updated >=` watermark poll** a few times/min + periodic deletion
  reconcile (§4.8).
- Delivery: **one feature branch off `main`**, phases as commits (§6).

**Still open:**
1. Poll cadence (e.g. every 15–20s while watching?) and reconcile interval (e.g. every
   5–10 min / on first open?) — concrete numbers.
2. Reference-data TTLs (accounts / projects / board columns) — acceptable staleness window.
3. Initial-backfill UX for large projects (thousands of issues): show partial mirror with a
   "syncing…" affordance, or block until first walk completes?

## 8. Future — centralized cache service (enterprise)

Out of scope for this work, but worth designing *toward*. In an enterprise rollout the
per-app local SQLite cache could be promoted to a **shared, central cache/sync service**
(one upstream poller for the whole org instead of one per user/device), which:
- collapses rate-limit pressure to a single set of pollers per org/account,
- shares warm data across users (one person's sync warms everyone's My Work),
- centralizes credential/permission handling and audit.

**The key enabler is interface discipline now, not building it now (YAGNI today).** If we keep
the contract clean — *the server owns SQLite; clients only talk to the server's projection
endpoints; no client ever touches raw provider data or its own data cache* — then extracting
the cache into a standalone service later is a **deployment/topology change, not an
architecture rewrite**: swap the in-process SQLite for a service client behind the same
projection interface. Phases 0–7 should therefore treat the cache layer as a module behind a
narrow interface, so this door stays open without any speculative work.
