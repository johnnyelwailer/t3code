import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  touchT3workContextBlob,
  upsertT3workContextArtifact,
  upsertT3workContextBlob,
} from "./t3work-context-blob-store-tables.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export const T3WORK_CONTEXT_BLOB_ROOT = ".t3work/context/_blobs";

export function hashT3workContextBytes(bytes: Uint8Array): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildT3workContextBlobRelativePath(sha256: string): string {
  return `${T3WORK_CONTEXT_BLOB_ROOT}/${sha256.slice(0, 2)}/${sha256}`;
}

function decodeT3workContextFileBytes(file: {
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
}): Uint8Array {
  return file.encoding === "base64"
    ? Uint8Array.from(Buffer.from(file.contents, "base64"))
    : new TextEncoder().encode(file.contents);
}

function artifactKind(encoding?: "utf8" | "base64"): string {
  return encoding === "base64" ? "attachment" : "context-file";
}

function ensureBlobOnDisk(input: {
  readonly workspaceRoot: string;
  readonly blobRelativePath: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;
    const resolved = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: input.blobRelativePath,
    });
    const exists = yield* fileSystem.exists(resolved.absolutePath);
    if (exists) {
      yield* upsertT3workContextBlob({
        sha256: input.sha256,
        path: input.blobRelativePath,
        sizeBytes: input.bytes.byteLength,
      });
      return;
    }
    yield* fileSystem.makeDirectory(path.dirname(resolved.absolutePath), { recursive: true });
    const tempPath = `${resolved.absolutePath}.${t3workRandomUUID()}.tmp`;
    yield* fileSystem.writeFile(tempPath, input.bytes).pipe(
      Effect.flatMap(() => fileSystem.rename(tempPath, resolved.absolutePath)),
      Effect.catch((cause) =>
        fileSystem.remove(tempPath, { force: true }).pipe(
          Effect.ignore,
          Effect.flatMap(() => Effect.fail(cause)),
        ),
      ),
    );
    yield* upsertT3workContextBlob({
      sha256: input.sha256,
      path: input.blobRelativePath,
      sizeBytes: input.bytes.byteLength,
    });
  });
}

function linkArtifactToBlob(input: {
  readonly workspaceRoot: string;
  readonly artifactRelativePath: string;
  readonly blobRelativePath: string;
  readonly bytes: Uint8Array;
  readonly encoding?: "utf8" | "base64";
}) {
  return Effect.gen(function* () {
    if (input.artifactRelativePath === input.blobRelativePath) {
      return;
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;
    const artifact = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: input.artifactRelativePath,
    });
    const blob = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: input.blobRelativePath,
    });
    yield* fileSystem.makeDirectory(path.dirname(artifact.absolutePath), { recursive: true });
    yield* fileSystem.remove(artifact.absolutePath, { force: true }).pipe(Effect.ignore);
    const linked = yield* fileSystem.link(blob.absolutePath, artifact.absolutePath).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (!linked) {
      yield* input.encoding === "base64"
        ? fileSystem.writeFile(artifact.absolutePath, input.bytes)
        : fileSystem.writeFileString(artifact.absolutePath, new TextDecoder().decode(input.bytes));
    }
  });
}

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
    yield* ensureBlobOnDisk({
      workspaceRoot: input.workspaceRoot,
      blobRelativePath,
      bytes,
      sha256,
    });
    yield* linkArtifactToBlob({
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
      kind: artifactKind(input.encoding),
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
