import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { upsertT3workContextBlob } from "./t3work-context-blob-store-tables.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export function ensureT3workContextBlobOnDisk(input: {
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

export function linkT3workContextArtifactToBlob(input: {
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
