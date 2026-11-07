// @effect-diagnostics nodeBuiltinImport:off - integration test uses real temp files.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";
import { afterEach } from "vite-plus/test";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  buildT3TeamContextBlobRelativePath,
  hashT3TeamContextBytes,
  writeT3TeamContextCasFile,
} from "./t3team-context-blob-store.ts";
import {
  deleteExpiredT3TeamContextBlobTombstones,
  markT3TeamContextBlobPurgedIfUnreferenced,
  T3TEAM_CONTEXT_BLOB_TOMBSTONE_RETENTION_MS,
} from "./t3team-context-blob-store-tables.ts";
import {
  claimOrphanT3TeamContextBlobSweep,
  sweepOrphanT3TeamContextBlobs,
} from "./t3team-context-blob-sweep.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

const layer = it.layer(
  Layer.mergeAll(
    NodeServices.layer,
    SqlitePersistenceMemory,
    WorkspacePaths.layer.pipe(Layer.provide(NodeServices.layer)),
  ),
);

const NOW_MS = 24 * 60 * 60 * 1000;

const setBlobMtime = (blobPath: string, ageMs: number) => {
  const mtimeSeconds = (NOW_MS - ageMs) / 1000;
  NodeFS.utimesSync(blobPath, mtimeSeconds, mtimeSeconds);
};

const blobPathFor = (root: string, contents: string) =>
  NodePath.join(
    root,
    buildT3TeamContextBlobRelativePath(hashT3TeamContextBytes(new TextEncoder().encode(contents))),
  );

const RELATIVE_PATH = ".t3team/context/entrypoint.json";

/** Writes each version over the same context file, so every earlier version's blob is orphaned. */
const rewriteContextFile = (root: string, versions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* ensureT3TeamContextCacheTables();
    yield* TestClock.setTime(NOW_MS);
    for (const contents of versions) {
      yield* writeT3TeamContextCasFile({
        workspaceRoot: root,
        relativePath: RELATIVE_PATH,
        contents,
      });
    }
  });

const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-blob-sweep-"));
  tempRoots.push(root);
  return root;
};

layer("t3team context blob sweep", (it) => {
  it.effect("removes the blob a rewrite superseded and keeps the live one", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      yield* rewriteContextFile(root, ['{"sweep":1}', '{"sweep":2}']);
      const superseded = blobPathFor(root, '{"sweep":1}');
      const live = blobPathFor(root, '{"sweep":2}');
      setBlobMtime(superseded, 60 * 60 * 1000);
      setBlobMtime(live, 60 * 60 * 1000);

      const result = yield* sweepOrphanT3TeamContextBlobs({ workspaceRoot: root });

      assert.equal(result.removedBlobCount, 1);
      assert.equal(result.reclaimedBytes, '{"sweep":1}'.length);
      assert.isFalse(NodeFS.existsSync(superseded));
      assert.isTrue(NodeFS.existsSync(live));
      assert.equal(NodeFS.readFileSync(NodePath.join(root, RELATIVE_PATH), "utf8"), '{"sweep":2}');
    }),
  );

  it.effect("leaves blobs younger than the minimum age alone", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      yield* rewriteContextFile(root, ['{"young":1}', '{"young":2}']);
      const superseded = blobPathFor(root, '{"young":1}');
      setBlobMtime(superseded, 1000);

      const result = yield* sweepOrphanT3TeamContextBlobs({ workspaceRoot: root });

      assert.equal(result.removedBlobCount, 0);
      assert.isTrue(NodeFS.existsSync(superseded));
    }),
  );

  it.effect("stops at the removal cap", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      const versions = ['{"cap":1}', '{"cap":2}', '{"cap":3}', '{"cap":4}'];
      yield* rewriteContextFile(root, versions);
      for (const contents of versions) {
        setBlobMtime(blobPathFor(root, contents), 60 * 60 * 1000);
      }

      const result = yield* sweepOrphanT3TeamContextBlobs({ workspaceRoot: root, maxRemoved: 2 });

      assert.equal(result.removedBlobCount, 2);
    }),
  );

  it.effect("bounds entries inspected per sweep and resumes from the cursor", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      const versions = ['{"scan":1}', '{"scan":2}', '{"scan":3}', '{"scan":4}'];
      yield* rewriteContextFile(root, versions);
      for (const contents of versions) {
        setBlobMtime(blobPathFor(root, contents), 60 * 60 * 1000);
      }

      const first = yield* sweepOrphanT3TeamContextBlobs({ workspaceRoot: root, maxInspected: 2 });
      assert.equal(first.inspected, 2);
      assert.isDefined(first.nextCursor);
      const second = yield* sweepOrphanT3TeamContextBlobs({
        workspaceRoot: root,
        maxInspected: 2,
        after: first.nextCursor!,
      });
      assert.equal(second.inspected, 2);
      assert.isUndefined(second.nextCursor);
      // Three superseded blobs go; the live one is linked by the artifact.
      assert.equal(first.removedBlobCount + second.removedBlobCount, 3);
      assert.isTrue(NodeFS.existsSync(blobPathFor(root, '{"scan":4}')));
    }),
  );

  it("throttles sweeps per root", () => {
    const root = "/throttle-root";
    const claimed = claimOrphanT3TeamContextBlobSweep(root, 1_000_000);
    assert.isDefined(claimed);
    assert.isUndefined(claimOrphanT3TeamContextBlobSweep(root, 1_000_000 + 60_000));
    claimed!.running = false;
    assert.isUndefined(claimOrphanT3TeamContextBlobSweep(root, 1_000_000 + 1_000));
    assert.isDefined(claimOrphanT3TeamContextBlobSweep(root, 1_000_000 + 60_000));
    assert.isDefined(claimOrphanT3TeamContextBlobSweep("/other-root", 1_000_000));
  });

  it.effect("does not mark a blob purged once an artifact references it", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      yield* rewriteContextFile(root, ['{"race":1}', '{"race":2}']);
      const sql = yield* SqlClient.SqlClient;
      const sha = (contents: string) => hashT3TeamContextBytes(new TextEncoder().encode(contents));
      const purgedAt = (contents: string) =>
        sql<{ readonly purged_at: number | null }>`
          SELECT purged_at FROM t3team_context_blobs WHERE sha256 = ${sha(contents)}
        `.pipe(Effect.map((rows) => rows[0]?.purged_at));

      yield* markT3TeamContextBlobPurgedIfUnreferenced(sha('{"race":2}'));
      assert.isNull(yield* purgedAt('{"race":2}'));
      yield* markT3TeamContextBlobPurgedIfUnreferenced(sha('{"race":1}'));
      assert.isNumber(yield* purgedAt('{"race":1}'));
    }),
  );

  it.effect("expires old unreferenced tombstones in bounded batches", () =>
    Effect.gen(function* () {
      yield* ensureT3TeamContextCacheTables();
      const sql = yield* SqlClient.SqlClient;
      const day = T3TEAM_CONTEXT_BLOB_TOMBSTONE_RETENTION_MS;
      // Earlier cases purge at NOW_MS; anchoring there keeps their tombstones inside the window.
      const now = NOW_MS;
      const rows: ReadonlyArray<readonly [string, number | null]> = [
        ["tomb-old-1", now - 2 * day],
        ["tomb-old-2", now - 2 * day],
        ["tomb-old-3", now - 3 * day],
        ["tomb-young", now - day / 2],
        ["tomb-live", null],
        ["tomb-linked", now - 5 * day],
      ];
      for (const [sha256, purgedAt] of rows) {
        yield* sql`
          INSERT INTO t3team_context_blobs (sha256, path, size_bytes, updated_at, last_accessed_at, purged_at)
          VALUES (${sha256}, ${sha256}, 1, 0, 0, ${purgedAt})
        `;
      }
      yield* sql`
        INSERT INTO t3team_context_artifacts (workspace_root, relative_path, kind, size_bytes, updated_at, last_accessed_at, blob_sha256)
        VALUES ('/root', 'a.json', 'context', 1, 0, 0, 'tomb-linked')
      `;
      const remaining = sql<{ readonly sha256: string }>`
        SELECT sha256 FROM t3team_context_blobs WHERE sha256 LIKE 'tomb-%' ORDER BY sha256
      `.pipe(Effect.map((found) => found.map((row) => row.sha256)));

      assert.equal(yield* deleteExpiredT3TeamContextBlobTombstones({ now, limit: 2 }), 2);
      assert.lengthOf(yield* remaining, 4);
      assert.equal(yield* deleteExpiredT3TeamContextBlobTombstones({ now, limit: 2 }), 1);
      assert.deepEqual(yield* remaining, ["tomb-linked", "tomb-live", "tomb-young"]);
      assert.equal(yield* deleteExpiredT3TeamContextBlobTombstones({ now, limit: 2 }), 0);
    }),
  );

  it.effect("looks artifacts up by blob through an index", () =>
    Effect.gen(function* () {
      yield* ensureT3TeamContextCacheTables();
      const sql = yield* SqlClient.SqlClient;
      const plan = yield* sql<{ readonly detail: string }>`
        EXPLAIN QUERY PLAN
        SELECT 1 FROM t3team_context_artifacts WHERE blob_sha256 = 'x'
      `;
      assert.isTrue(
        plan.some((row) => row.detail.includes("idx_t3team_context_artifacts_blob_sha256")),
      );
    }),
  );
});
