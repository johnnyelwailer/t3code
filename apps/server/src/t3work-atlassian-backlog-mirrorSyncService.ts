import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import { toPersistenceSqlError } from "./persistence/Errors.ts";
import * as Clock from "effect/Clock";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Pages fetched before pausing to avoid hammering Jira. */
const maxPagesPerBurst = 10;
const burstPause = "3 seconds";

/** Hard cap on pages per incremental walk — prevents runaway loops. */
const maxPagesPerWalk = 200;

/** Incremental wake interval (normal polling). */
const normalSleepMs = 90_000; // 90 seconds

/** Full-reconcile interval: once per ~24 h. */
const reconcileIntervalMs = 24 * 60 * 60 * 1_000;

/**
 * Minimum relative lookback for incremental walks: fetch issues updated in the
 * last N minutes (`updated >= -Nm`). Comfortably larger than the ~90 s poll
 * interval so brief hiccups don't drop updates. Over-fetch is harmless (upserts
 * dedupe) and typically stays within one page.
 */
const minIncrementalLookbackMinutes = 15;

/**
 * Slack added on top of the elapsed-time-based lookback so clock skew between
 * this machine and Jira (and JQL's minute granularity) can't drop updates.
 */
const incrementalLookbackSlackMinutes = 5;

/**
 * Cap on the widened lookback. Anything older than this is the 24 h
 * reconcile's job anyway, and an uncapped `updated >= -Nm` after a very long
 * suspend would degenerate into a full-project walk on the incremental path.
 */
const maxIncrementalLookbackMinutes = 24 * 60;

/**
 * Lookback for an incremental walk, widened by the time since the last
 * successful walk so a gap (laptop suspend, repeated walk failures) doesn't
 * drop updates until the 24 h reconcile. `lastSuccessfulWalkMs` of 0 (no
 * successful walk yet) yields the max lookback via the cap.
 */
export function computeIncrementalLookbackMinutes(input: {
  readonly nowMs: number;
  readonly lastSuccessfulWalkMs: number;
}): number {
  const elapsedMinutes = Math.ceil(Math.max(0, input.nowMs - input.lastSuccessfulWalkMs) / 60_000);
  return Math.min(
    Math.max(minIncrementalLookbackMinutes, elapsedMinutes + incrementalLookbackSlackMinutes),
    maxIncrementalLookbackMinutes,
  );
}

/** Mirror page size. */
const mirrorPageSize = 100;

// ─── Single-flight map ───────────────────────────────────────────────────────

type ActiveMirrorSync = { readonly token: symbol };

/**
 * One background loop per (provider|account|project). A second call for the
 * same triple while a loop is running is a no-op.
 */
const activeMirrorSyncs = new Map<string, ActiveMirrorSync>();

function mirrorSyncMapKey(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}): string {
  return `${input.account.provider}|${input.account.id}|${input.externalProjectId}`;
}

/**
 * Test-only visibility into the single-flight map: is a mirror sync loop
 * currently registered for this (provider, account, project) triple? Lets
 * tests assert that a terminated loop released its key (so a later kick can
 * start a fresh loop) without exposing the map itself.
 */
export function hasActiveT3workAtlassianMirrorSync(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}): boolean {
  return activeMirrorSyncs.has(mirrorSyncMapKey(input));
}

// ─── Public kick function ─────────────────────────────────────────────────────

export type T3workAtlassianMirrorSyncRequest = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
};

/**
 * Kick off the whole-project mirror sync background loop for one project.
 *
 * Single-flight: if a loop is already running for this (provider, account,
 * project) triple the call is a no-op. The loop runs indefinitely until the
 * process exits, sleeping ~90 s between incremental walks and doing a full
 * reconcile every ~24 h.
 *
 * Nothing calls this yet — Wave 3 wires it into the My Work endpoint.
 */
export function kickT3workAtlassianMirrorSync(input: T3workAtlassianMirrorSyncRequest) {
  const mapKey = mirrorSyncMapKey(input);
  if (activeMirrorSyncs.has(mapKey)) {
    return Effect.void;
  }

  const token = Symbol(mapKey);
  activeMirrorSyncs.set(mapKey, { token });

  const isSuperseded = () => activeMirrorSyncs.get(mapKey)?.token !== token;
  const unregister = Effect.sync(() => {
    if (activeMirrorSyncs.get(mapKey)?.token === token) {
      activeMirrorSyncs.delete(mapKey);
    }
  });

  return runMirrorLoop(input, isSuperseded).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3work atlassian mirror sync loop terminated", cause),
    ),
    Effect.ensuring(unregister),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

// ─── Main loop ───────────────────────────────────────────────────────────────

function runMirrorLoop(input: T3workAtlassianMirrorSyncRequest, isSuperseded: () => boolean) {
  const identity = {
    provider: input.account.provider,
    accountId: input.account.id,
    externalProjectId: input.externalProjectId,
  };

  return Effect.gen(function* () {
    let lastReconcileMs = 0;
    let lastSuccessfulWalkMs = 0;

    while (true) {
      if (isSuperseded()) return;

      // Re-resolve the provider every iteration instead of using a captured
      // instance: JiraApiClient freezes its auth at construction (no
      // in-place refresh), so a provider resolved once at kick time goes
      // stale as soon as the OAuth access token expires (~1h). Re-resolving
      // via providerForAccount re-reads persisted auth and runs
      // refreshOAuthAuthIfNeeded, so a refreshed token is picked up here.
      const provider = yield* providerForAccount(input.account.id);

      if (!(provider instanceof AtlassianIntegrationProvider)) {
        // Resolved to the mock provider (no real Atlassian auth persisted
        // for this account) — nothing to walk. Terminate so the single-flight
        // map unblocks a future kick once real auth is available, rather
        // than looping forever on a walk that can never succeed.
        yield* Effect.logDebug(
          "t3work atlassian mirror sync: resolved provider is not an AtlassianIntegrationProvider; terminating loop",
        ).pipe(Effect.annotateLogs(identity));
        return;
      }

      const nowMs = yield* Clock.currentTimeMillis;
      const doReconcile = nowMs - lastReconcileMs >= reconcileIntervalMs;

      if (doReconcile) {
        // A reconcile covers everything an incremental walk would, so on
        // success it also counts as a successful walk for lookback purposes.
        yield* runMirrorReconcile(input, provider, identity, isSuperseded).pipe(
          Effect.andThen(
            Effect.sync(() => {
              lastSuccessfulWalkMs = nowMs;
            }),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("t3work atlassian mirror reconcile walk failed", cause),
          ),
        );
        lastReconcileMs = yield* Clock.currentTimeMillis;
      } else {
        // Widen the JQL lookback to cover the gap since the last successful
        // walk (laptop suspend, failed walks) instead of a fixed 15 m window.
        // Anchor to the walk's *start* so updates landing mid-walk aren't
        // skipped by the next window.
        const lookbackMinutes = computeIncrementalLookbackMinutes({
          nowMs,
          lastSuccessfulWalkMs,
        });
        yield* runMirrorIncrementalWalk(input, provider, identity, isSuperseded, lookbackMinutes).pipe(
          Effect.andThen(
            Effect.sync(() => {
              lastSuccessfulWalkMs = nowMs;
            }),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("t3work atlassian mirror incremental walk failed", cause),
          ),
        );
      }

      if (isSuperseded()) return;
      yield* Effect.sleep(normalSleepMs);
    }
  });
}

// ─── Incremental walk (watermark-based) ──────────────────────────────────────

function runMirrorIncrementalWalk(
  input: T3workAtlassianMirrorSyncRequest,
  provider: AtlassianIntegrationProvider,
  identity: { provider: string; accountId: string; externalProjectId: string },
  isSuperseded: () => boolean,
  lookbackMinutes: number,
) {
  return Effect.gen(function* () {
    let cursor: string | undefined;
    let pagesThisBurst = 0;
    let pagesThisWalk = 0;

    while (pagesThisWalk < maxPagesPerWalk) {
      if (isSuperseded()) return;

      if (pagesThisBurst >= maxPagesPerBurst) {
        pagesThisBurst = 0;
        yield* Effect.sleep(burstPause);
        if (isSuperseded()) return;
      }

      const page = yield* tryAtlassianPromise(
        () =>
          provider.listProjectMirrorPage({
            account: input.account,
            externalProjectId: input.externalProjectId,
            updatedWithinMinutes: lookbackMinutes,
            ...(cursor ? { cursor } : {}),
            limit: mirrorPageSize,
          }),
        "Failed to fetch Atlassian mirror page (incremental).",
      );

      pagesThisBurst += 1;
      pagesThisWalk += 1;

      if (isSuperseded()) return;

      yield* upsertMirrorIssues({ identity, items: page.items as ReadonlyArray<Record<string, unknown> & { id: string }> });

      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }

    yield* Effect.logDebug(
      "t3work atlassian mirror incremental walk hit page cap",
    ).pipe(
      Effect.annotateLogs({
        provider: identity.provider,
        accountId: identity.accountId,
        externalProjectId: identity.externalProjectId,
        pagesThisWalk,
      }),
    );
  });
}

// ─── Full reconcile walk ──────────────────────────────────────────────────────

/**
 * Walks every issue in the project (no updated filter), collects all seen IDs,
 * then deletes rows for issues that are no longer in the project at all.
 */
function runMirrorReconcile(
  input: T3workAtlassianMirrorSyncRequest,
  provider: AtlassianIntegrationProvider,
  identity: { provider: string; accountId: string; externalProjectId: string },
  isSuperseded: () => boolean,
) {
  return Effect.gen(function* () {
    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let pagesThisBurst = 0;
    let pagesThisWalk = 0;
    let walkComplete = false;

    while (pagesThisWalk < maxPagesPerWalk) {
      if (isSuperseded()) return;

      if (pagesThisBurst >= maxPagesPerBurst) {
        pagesThisBurst = 0;
        yield* Effect.sleep(burstPause);
        if (isSuperseded()) return;
      }

      const page = yield* tryAtlassianPromise(
        () =>
          provider.listProjectMirrorPage({
            account: input.account,
            externalProjectId: input.externalProjectId,
            // No updatedSinceIso: walk the whole project
            ...(cursor ? { cursor } : {}),
            limit: mirrorPageSize,
          }),
        "Failed to fetch Atlassian mirror page (reconcile).",
      );

      pagesThisBurst += 1;
      pagesThisWalk += 1;

      for (const item of page.items) {
        seenIds.add(item.id);
      }

      if (isSuperseded()) return;

      yield* upsertMirrorIssues({ identity, items: page.items as ReadonlyArray<Record<string, unknown> & { id: string }> });

      if (!page.nextCursor) {
        walkComplete = true;
        break;
      }
      cursor = page.nextCursor;
    }

    if (isSuperseded()) return;

    // Only prune when the walk actually reached the end of the project. If it
    // stopped early (hit the page cap on a very large project), seenIds is
    // incomplete and pruning would wrongly delete issues beyond the cap.
    if (!walkComplete) {
      yield* Effect.logWarning(
        "t3work atlassian mirror reconcile hit page cap before completing; skipping prune to avoid deleting unseen issues",
      ).pipe(
        Effect.annotateLogs({
          provider: identity.provider,
          accountId: identity.accountId,
          externalProjectId: identity.externalProjectId,
          pagesThisWalk,
        }),
      );
      return;
    }

    // Prune rows for issues that no longer exist in the project at all.
    yield* deleteMirrorIssuesAbsentFromWalk({ identity, seenIds }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3work atlassian mirror reconcile prune failed", cause),
      ),
    );
  });
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function upsertMirrorIssues(input: {
  identity: { provider: string; accountId: string; externalProjectId: string };
  items: ReadonlyArray<Record<string, unknown> & { readonly id: string }>;
}) {
  return Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const updatedAt = yield* Clock.currentTimeMillis;

    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const item of input.items) {
          const assigneeAccountId =
            typeof item["assigneeAccountId"] === "string" ? item["assigneeAccountId"] : null;
          const issueKey =
            typeof item["displayId"] === "string" ? item["displayId"] : null;
          yield* sql`
            INSERT INTO t3work_atlassian_backlog_issues (
              provider,
              account_id,
              external_project_id,
              issue_id,
              issue_key,
              resource_json,
              updated_at,
              assignee_account_id
            )
            VALUES (
              ${input.identity.provider},
              ${input.identity.accountId},
              ${input.identity.externalProjectId},
              ${item.id},
              ${issueKey},
              ${serializeBacklogCacheJson(item)},
              ${updatedAt},
              ${assigneeAccountId}
            )
            ON CONFLICT (provider, account_id, external_project_id, issue_id)
            DO UPDATE SET
              issue_key = excluded.issue_key,
              resource_json = excluded.resource_json,
              updated_at = excluded.updated_at,
              assignee_account_id = excluded.assignee_account_id
          `;
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianMirrorSync.upsertIssues")));
}

function deleteMirrorIssuesAbsentFromWalk(input: {
  identity: { provider: string; accountId: string; externalProjectId: string };
  seenIds: Set<string>;
}) {
  return Effect.gen(function* () {
    if (input.seenIds.size === 0) return;

    const sql = yield* SqlClient.SqlClient;

    // Fetch all stored IDs for the project, delete those not in seenIds.
    const storedRows = yield* sql<{ issueId: string }>`
      SELECT issue_id AS "issueId"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.identity.provider}
        AND account_id = ${input.identity.accountId}
        AND external_project_id = ${input.identity.externalProjectId}
    `;

    const toDelete = storedRows
      .map((r) => r.issueId)
      .filter((id) => !input.seenIds.has(id));

    if (toDelete.length === 0) return;

    yield* Effect.logDebug("t3work atlassian mirror reconcile pruning stale issues").pipe(
      Effect.annotateLogs({
        provider: input.identity.provider,
        accountId: input.identity.accountId,
        externalProjectId: input.identity.externalProjectId,
        pruneCount: toDelete.length,
      }),
    );

    // Delete one row at a time inside a single transaction.
    // Pruning is infrequent (~24 h) so individual deletes are acceptable.
    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const issueId of toDelete) {
          yield* sql`
            DELETE FROM t3work_atlassian_backlog_issues
            WHERE provider = ${input.identity.provider}
              AND account_id = ${input.identity.accountId}
              AND external_project_id = ${input.identity.externalProjectId}
              AND issue_id = ${issueId}
          `;
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianMirrorSync.pruneIssues")));
}

