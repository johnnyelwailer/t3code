import { assert, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import {
  loadT3TeamContextRefreshJobQueue,
  loadT3TeamContextRefreshJobSeen,
  replaceT3TeamContextRefreshJobQueue,
  replaceT3TeamContextRefreshJobSeen,
  upsertT3TeamContextRefreshJob,
} from "./t3team-context-refresh-jobs.ts";

const testLayer = SqlitePersistenceMemory;

afterEach(() => {});

it.effect("persists and reloads background refresh job queue state", () =>
  Effect.gen(function* () {
    yield* ensureT3TeamContextCacheTables();
    const now = yield* Clock.currentTimeMillis;
    yield* upsertT3TeamContextRefreshJob({
      jobId: "job-1",
      rootKey: "PROJ-1",
      workspaceRoot: "/tmp/workspace",
      status: "pending",
      maxDepth: 25,
      currentDepth: 1,
    });
    yield* replaceT3TeamContextRefreshJobQueue({
      jobId: "job-1",
      queue: [{ resourceKey: "PROJ-2", depth: 2, enqueuedAt: now }],
    });
    yield* replaceT3TeamContextRefreshJobSeen({
      jobId: "job-1",
      seen: ["PROJ-1", "PROJ-2"],
    });

    const queue = yield* loadT3TeamContextRefreshJobQueue("job-1");
    const seen = yield* loadT3TeamContextRefreshJobSeen("job-1");
    assert.deepStrictEqual(queue, [{ resourceKey: "PROJ-2", depth: 2, enqueuedAt: now }]);
    assert.deepStrictEqual(seen, ["PROJ-1", "PROJ-2"]);
  }).pipe(Effect.provide(testLayer)),
);
