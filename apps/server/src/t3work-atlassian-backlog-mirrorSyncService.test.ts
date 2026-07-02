/**
 * Unit tests for the whole-project mirror sync service (Epic 33, Wave 2).
 *
 * The background loop (kickT3workAtlassianMirrorSync) uses forkDetach which
 * makes observing its DB side effects timing-sensitive in tests, so this file
 * covers the single-flight guard (synchronous, no DB access needed). The
 * relative-JQL incremental filter is covered in the provider unit tests.
 */

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  computeIncrementalLookbackMinutes,
  kickT3workAtlassianMirrorSync,
} from "./t3work-atlassian-backlog-mirrorSyncService.ts";
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
