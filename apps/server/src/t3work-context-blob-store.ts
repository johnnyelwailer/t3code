import * as Effect from "effect/Effect";

import {
  ensureT3workContextBlobOnDisk,
  linkT3workContextArtifactToBlob,
} from "./t3work-context-blob-store-disk.ts";
import {
  buildT3workContextBlobRelativePath,
  decodeT3workContextFileBytes,
  hashT3workContextBytes,
  t3workContextArtifactKind,
} from "./t3work-context-blob-store-utils.ts";
import {
  touchT3workContextBlob,
  upsertT3workContextArtifact,
} from "./t3work-context-blob-store-tables.ts";

export {
  buildT3workContextBlobRelativePath,
  hashT3workContextBytes,
  T3WORK_CONTEXT_BLOB_ROOT,
} from "./t3work-context-blob-store-utils.ts";

export function writeT3workContextCasFile(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
}) {
  return Effect.gen(function* () {
    const bytes = decodeT3workContextFileBytes(input);
    const sha256 = hashT3workContextBytes(bytes);
    const blobRelativePath = buildT3workContextBlobRelativePath(sha256);
    yield* ensureT3workContextBlobOnDisk({
      workspaceRoot: input.workspaceRoot,
      blobRelativePath,
      bytes,
      sha256,
    });
    yield* linkT3workContextArtifactToBlob({
      workspaceRoot: input.workspaceRoot,
      artifactRelativePath: input.relativePath,
      blobRelativePath,
      bytes,
      ...(input.encoding ? { encoding: input.encoding } : {}),
    });
    yield* touchT3workContextBlob(sha256);
    yield* upsertT3workContextArtifact({
      workspaceRoot: input.workspaceRoot,
      relativePath: input.relativePath,
      kind: t3workContextArtifactKind(input.encoding),
      sizeBytes: bytes.byteLength,
      blobSha256: sha256,
    });
    return input.relativePath;
  });
}

export function writeT3workContextCasFiles(input: {
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
        yield* writeT3workContextCasFile({
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
