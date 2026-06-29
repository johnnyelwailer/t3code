// @effect-diagnostics nodeBuiltinImport:off - integration test uses real temp files.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

layer("t3work context blob store", (it) => {
  it.effect("dedupes identical file bytes through CAS blobs", () =>
    Effect.gen(function* () {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-blob-store-"));
      tempRoots.push(root);
      yield* ensureT3workContextCacheTables();
      const contents = '{"same":true}';
      const sha256 = hashT3workContextBytes(new TextEncoder().encode(contents));
      yield* writeT3workContextCasFile({
        workspaceRoot: root,
        relativePath: ".t3work/context/jira/p1/items/a/summary.json",
        contents,
      });
      yield* writeT3workContextCasFile({
        workspaceRoot: root,
        relativePath: ".t3work/context/jira/p1/items/b/summary.json",
        contents,
      });
      const blobPath = NodePath.join(root, buildT3workContextBlobRelativePath(sha256));
      assert.isTrue(NodeFS.existsSync(blobPath));
      assert.equal(
        yield* sumT3workContextBlobBytes(),
        new TextEncoder().encode(contents).byteLength,
      );
      assert.equal(yield* countT3workContextBlobReferences(sha256), 2);
    }),
  );
});
