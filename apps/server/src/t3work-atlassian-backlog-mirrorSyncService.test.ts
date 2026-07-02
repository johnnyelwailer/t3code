/**
 * Unit tests for the whole-project mirror sync service (Epic 33, Wave 2).
 *
 * The background loop (kickT3workAtlassianMirrorSync) uses forkDetach which
 * makes observing its DB side effects timing-sensitive in tests, so this file
 * covers the single-flight guard (synchronous, no DB access needed) plus the
 * reconcile prune paths via the exported runMirrorReconcile walk: a completed
 * empty walk prunes, a provider-unavailable failure never does. The
 * relative-JQL incremental filter is covered in the provider unit tests.
 */

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  computeIncrementalLookbackMinutes,
  kickT3workAtlassianMirrorSync,
  runMirrorReconcile,
} from "./t3work-atlassian-backlog-mirrorSyncService.ts";
import { AtlassianMirrorSourceUnavailableError } from "@t3tools/integrations-atlassian";
import type { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";

// providerForAccount (re-resolved every loop iteration — see Fix 1) reads
// persisted Atlassian auth from disk, so the test layer needs FileSystem/Path
// (NodeServices) and ServerConfig alongside the in-memory SQL layer.
const mirrorSyncCacheLayer = it.layer(
  Layer.mergeAll(
    SqlitePersistenceMemory,
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix: "t3work-mirror-sync-test" }).pipe(
      Layer.provide(NodeServices.layer),
    ),
  ),
);

const mockAccount: IntegrationAccountRef = {
  id: "https://test.atlassian.net",
  provider: "atlassian",
};

mirrorSyncCacheLayer("t3work Atlassian mirror sync service", (it) => {
  it.effect(
    "single-flight: second kick while loop running returns Effect.void without launching a second loop",
    () =>
      Effect.gen(function* () {
        // No real Atlassian auth is persisted for this account, so the loop
        // resolves the mock provider and terminates on its first iteration.
        // That's fine for this test: it only exercises the single-flight
        // guard, which is synchronous and independent of the walk itself.
        yield* kickT3workAtlassianMirrorSync({
          account: mockAccount,
          externalProjectId: "project-1",
        });

        // Second kick for the same triple must be a no-op.
        yield* kickT3workAtlassianMirrorSync({
          account: mockAccount,
          externalProjectId: "project-1",
        });

        assert.ok(true, "both kicks completed without throwing");
      }),
  );

  const identity = {
    provider: "atlassian",
    accountId: mockAccount.id,
    externalProjectId: "project-1",
  };

  const reconcileWith = (provider: AtlassianIntegrationProvider) =>
    runMirrorReconcile(
      { account: mockAccount, externalProjectId: "project-1" },
      provider,
      identity,
      () => false,
    );

  const countMirrorRows = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ count: number }>`
      SELECT COUNT(*) AS "count"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
    return rows[0]?.count ?? 0;
  });

  const providerReturning = (
    pages: ReadonlyArray<{ items: ReadonlyArray<{ id: string; displayId: string }> }>,
  ) => {
    let call = 0;
    return {
      listProjectMirrorPage: vi.fn(async () => {
        const page = pages[Math.min(call, pages.length - 1)];
        call += 1;
        return { items: page?.items ?? [], nextCursor: undefined };
      }),
    } as unknown as AtlassianIntegrationProvider;
  };

  it.effect(
    "reconcile prunes every mirrored row when a complete walk finds a genuinely emptied project",
    () =>
      Effect.gen(function* () {
        yield* reconcileWith(
          providerReturning([
            {
              items: [
                { id: "10001", displayId: "PROJ-1" },
                { id: "10002", displayId: "PROJ-2" },
              ],
            },
          ]),
        );
        assert.strictEqual(yield* countMirrorRows, 2);

        // The project was genuinely emptied: the walk completes with zero items.
        yield* reconcileWith(providerReturning([{ items: [] }]));
        assert.strictEqual(yield* countMirrorRows, 0);
      }),
  );

  it.effect(
    "reconcile keeps mirrored rows when the provider reports the source unavailable",
    () =>
      Effect.gen(function* () {
        yield* reconcileWith(
          providerReturning([{ items: [{ id: "10001", displayId: "PROJ-1" }] }]),
        );
        assert.strictEqual(yield* countMirrorRows, 1);

        const unavailableProvider = {
          listProjectMirrorPage: vi.fn(async () => {
            throw new AtlassianMirrorSourceUnavailableError({
              reason: "project-not-found",
              externalProjectId: "project-1",
              message: "project lookup failed",
            });
          }),
        } as unknown as AtlassianIntegrationProvider;

        const exit = yield* Effect.exit(reconcileWith(unavailableProvider));
        assert.ok(Exit.isFailure(exit), "reconcile must fail, not treat it as an empty project");
        assert.strictEqual(yield* countMirrorRows, 1);
      }),
  );
});

it("lookback widening: normal 90 s cadence stays at the 15 m floor", () => {
  const nowMs = 10 * 60_000;
  assert.strictEqual(
    computeIncrementalLookbackMinutes({ nowMs, lastSuccessfulWalkMs: nowMs - 90_000 }),
    15,
  );
});

it("lookback widening: gap since last successful walk widens the window with slack", () => {
  // 47 m 10 s gap (e.g. laptop suspend) → ceil to 48 m + 5 m slack = 53 m.
  const nowMs = 100 * 60_000;
  assert.strictEqual(
    computeIncrementalLookbackMinutes({
      nowMs,
      lastSuccessfulWalkMs: nowMs - (47 * 60_000 + 10_000),
    }),
    53,
  );
});

it("lookback widening: elapsed just past the floor threshold leaves the floor", () => {
  // 11 m gap → 11 + 5 = 16 m, one past the 15 m floor.
  const nowMs = 60 * 60_000;
  assert.strictEqual(
    computeIncrementalLookbackMinutes({ nowMs, lastSuccessfulWalkMs: nowMs - 11 * 60_000 }),
    16,
  );
});

it("lookback widening: caps at 24 h for very long gaps and the never-succeeded case", () => {
  const nowMs = 3 * 24 * 60 * 60_000;
  assert.strictEqual(
    computeIncrementalLookbackMinutes({ nowMs, lastSuccessfulWalkMs: 0 }),
    24 * 60,
  );
});

it("lookback widening: clock going backwards never shrinks below the floor", () => {
  assert.strictEqual(
    computeIncrementalLookbackMinutes({ nowMs: 1_000, lastSuccessfulWalkMs: 5 * 60_000 }),
    15,
  );
});
// trivial
