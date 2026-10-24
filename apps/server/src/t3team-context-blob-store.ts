import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import {
  ensureT3TeamContextBlobOnDisk,
  linkT3TeamContextArtifactToBlob,
} from "./t3team-context-blob-store-disk.ts";
import {
  buildT3TeamContextBlobRelativePath,
  decodeT3TeamContextFileBytes,
  hashT3TeamContextBytes,
  t3teamContextArtifactKind,
} from "./t3team-context-blob-store-utils.ts";
import {
  touchT3TeamContextBlob,
  upsertT3TeamContextArtifact,
} from "./t3team-context-blob-store-tables.ts";

export {
  buildT3TeamContextBlobRelativePath,
  hashT3TeamContextBytes,
} from "./t3team-context-blob-store-utils.ts";

export function writeT3TeamContextCasFile(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
}) {
  return Effect.gen(function* () {
    const bytes = decodeT3TeamContextFileBytes(input);
    const sha256 = hashT3TeamContextBytes(bytes);
    const blobRelativePath = buildT3TeamContextBlobRelativePath(sha256);
    yield* ensureT3TeamContextBlobOnDisk({
      workspaceRoot: input.workspaceRoot,
      blobRelativePath,
      bytes,
      sha256,
    });
    yield* linkT3TeamContextArtifactToBlob({
      workspaceRoot: input.workspaceRoot,
      artifactRelativePath: input.relativePath,
      blobRelativePath,
      bytes,
      ...(input.encoding ? { encoding: input.encoding } : {}),
    });
    const sql = yield* SqlClient.SqlClient;
    // One transaction: a sweep's purge mark can land between these two statements, so a crash or
    // failed touch after a committed artifact row would leave a live blob out of the budget for good.
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* upsertT3TeamContextArtifact({
          workspaceRoot: input.workspaceRoot,
          relativePath: input.relativePath,
          kind: t3teamContextArtifactKind(input.encoding),
          sizeBytes: bytes.byteLength,
          blobSha256: sha256,
        });
        yield* touchT3TeamContextBlob(sha256);
      }),
    );
    return input.relativePath;
  });
}

export function writeT3TeamContextCasFiles(input: {
  readonly workspaceRoot: string;
  readonly files: ReadonlyArray<{
    readonly relativePath: string;
    readonly contents: string;
    readonly encoding?: "utf8" | "base64";
  }>;
}) {
  return Effect.gen(function* () {
    const writtenFiles: string[] = [];
    for (const file of input.files) {
      writtenFiles.push(
        yield* writeT3TeamContextCasFile({
          workspaceRoot: input.workspaceRoot,
          relativePath: file.relativePath,
          contents: file.contents,
          ...(file.encoding ? { encoding: file.encoding } : {}),
        }),
      );
    }
    return writtenFiles;
  });
}
