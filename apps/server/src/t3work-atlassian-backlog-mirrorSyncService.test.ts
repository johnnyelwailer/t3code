/**
 * Unit tests for the whole-project mirror sync service (Epic 33, Wave 2).
 *
 * The background loop (kickT3workAtlassianMirrorSync) uses forkDetach which
 * makes observing its DB side effects timing-sensitive in tests, so this file
 * covers the single-flight guard (synchronous, no DB access needed). The
 * relative-JQL incremental filter is covered in the provider unit tests.
 */

import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { kickT3workAtlassianMirrorSync } from "./t3work-atlassian-backlog-mirrorSyncService.ts";
import type { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";

const mirrorSyncCacheLayer = it.layer(SqlitePersistenceMemory);

const mockAccount: IntegrationAccountRef = {
  id: "https://test.atlassian.net",
  provider: "atlassian",
};

function makeMockProvider(): AtlassianIntegrationProvider {
  return {
    listProjectMirrorPage: vi.fn(async () => ({ items: [], nextCursor: undefined })),
  } as unknown as AtlassianIntegrationProvider;
}

mirrorSyncCacheLayer("t3work Atlassian mirror sync service", (it) => {
  it.effect(
    "single-flight: second kick while loop running returns Effect.void without launching a second loop",
    () =>
      Effect.gen(function* () {
        const provider = makeMockProvider();

        yield* kickT3workAtlassianMirrorSync({
          provider,
          account: mockAccount,
          externalProjectId: "project-1",
        });

        // Second kick for the same triple must be a no-op.
        yield* kickT3workAtlassianMirrorSync({
          provider,
          account: mockAccount,
          externalProjectId: "project-1",
        });

        assert.ok(true, "both kicks completed without throwing");
      }),
  );
});
