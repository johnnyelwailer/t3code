// @effect-diagnostics nodeBuiltinImport:off - integration test uses real temp files.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { afterEach } from "vite-plus/test";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  buildT3workContextBlobRelativePath,
  hashT3workContextBytes,
  writeT3workContextCasFile,
} from "./t3work-context-blob-store.ts";
import {
  countT3workContextBlobReferences,
  sumT3workContextBlobBytes,
} from "./t3work-context-blob-store-tables.ts";
import { calculateT3workContextCacheBudget } from "./t3work-context-cache-budget.ts";
import { purgeT3workContextCache } from "./t3work-context-cache-purge.ts";
import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
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

layer("t3work context cache purge", (it) => {
  it.effect("purges unreferenced blobs under soft pressure", () =>
    Effect.gen(function* () {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-cache-purge-"));
      tempRoots.push(root);
      yield* ensureT3workContextCacheTables();
      const bytes = new TextEncoder().encode("orphan blob");
      const sha256 = hashT3workContextBytes(bytes);
      const blobRelativePath = buildT3workContextBlobRelativePath(sha256);
      const blobAbsolutePath = NodePath.join(root, blobRelativePath);
      NodeFS.mkdirSync(NodePath.dirname(blobAbsolutePath), { recursive: true });
      NodeFS.writeFileSync(blobAbsolutePath, bytes);
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO t3work_context_blobs (
          sha256, path, size_bytes, updated_at, last_accessed_at, purged_at
        ) VALUES (${sha256}, ${blobRelativePath}, ${bytes.byteLength}, 1, 1, NULL)
      `;
      const budget = calculateT3workContextCacheBudget({
        totalBytes: 1_000,
        freeBytes: 1_000,
        reserveBytesOverride: 990,
      });
      const result = yield* purgeT3workContextCache({ workspaceRoot: root, budget });
      assert.equal(result.purgedBlobCount, 1);
      assert.equal(result.reclaimedBytes, bytes.byteLength);
      assert.equal(yield* sumT3workContextBlobBytes(), 0);
      assert.isFalse(NodeFS.existsSync(blobAbsolutePath));
      assert.equal(yield* countT3workContextBlobReferences(sha256), 0);
    }),
  );

  it.effect("keeps blobs that still have artifact references", () =>
    Effect.gen(function* () {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-cache-purge-"));
      tempRoots.push(root);
      yield* ensureT3workContextCacheTables();
      yield* writeT3workContextCasFile({
        workspaceRoot: root,
        relativePath: ".t3work/context/jira/p1/items/a/summary.json",
        contents: '{"keep":true}',
      });
      const budget = calculateT3workContextCacheBudget({
        totalBytes: 1_000,
        freeBytes: 1_000,
        reserveBytesOverride: 1,
      });
      const result = yield* purgeT3workContextCache({ workspaceRoot: root, budget });
      assert.equal(result.purgedBlobCount, 0);
      assert.isTrue((yield* sumT3workContextBlobBytes()) > 0);
    }),
  );
});
