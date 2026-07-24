import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeT3TeamContextCasFiles } from "./t3team-context-blob-store.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export type T3TeamContextFileWrite = {
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
};

export type T3TeamWorkspaceContextFilesWriteResult = {
  readonly workspaceRoot: string;
  readonly writtenFiles: ReadonlyArray<string>;
};

const CONTEXT_SYNC_COMMIT_MARKER_PATH = ".t3team/context/.sync-commit.json";

const workspaceWriteLocks = new Map<string, Promise<void>>();

const ContextSyncCommitMarkerJson = fromJsonStringPretty(
  Schema.Struct({
    kind: Schema.Literal("t3team-context-sync-commit"),
    committedAt: Schema.String,
    writtenFiles: Schema.Array(Schema.String),
  }),
);
const encodeContextSyncCommitMarker = Schema.encodeEffect(ContextSyncCommitMarkerJson);

function acquireWorkspaceWriteLock(workspaceRoot: string) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const previous = workspaceWriteLocks.get(workspaceRoot) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.catch(() => undefined).then(() => current);
      workspaceWriteLocks.set(workspaceRoot, tail);
      yield* Effect.promise(() => previous.catch(() => undefined));
      return { release, tail };
    }),
    ({ release, tail }) =>
      Effect.sync(() => {
        release();
        if (workspaceWriteLocks.get(workspaceRoot) === tail) {
          workspaceWriteLocks.delete(workspaceRoot);
        }
      }),
  );
}

function writeT3TeamWorkspaceContextFilesUnlocked(input: {
  readonly workspaceRoot: string;
  readonly files: ReadonlyArray<T3TeamContextFileWrite>;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;

    yield* fileSystem.makeDirectory(input.workspaceRoot, { recursive: true });
    yield* ensureT3TeamContextCacheTables();

    const writtenFiles = yield* writeT3TeamContextCasFiles({
      workspaceRoot: input.workspaceRoot,
      files: input.files,
    });

    const commitMarker = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: CONTEXT_SYNC_COMMIT_MARKER_PATH,
    });
    yield* fileSystem.makeDirectory(path.dirname(commitMarker.absolutePath), { recursive: true });
    const commitMarkerTempPath = `${commitMarker.absolutePath}.${t3teamRandomUUID()}.tmp`;
    const commitMarkerContents = yield* encodeContextSyncCommitMarker({
      kind: "t3team-context-sync-commit",
      committedAt: DateTime.formatIso(yield* DateTime.now),
      writtenFiles,
    });
    yield* fileSystem.writeFileString(commitMarkerTempPath, `${commitMarkerContents}\n`).pipe(
      Effect.flatMap(() => fileSystem.rename(commitMarkerTempPath, commitMarker.absolutePath)),
      Effect.catch((cause) =>
        fileSystem.remove(commitMarkerTempPath, { force: true }).pipe(
          Effect.ignore,
          Effect.flatMap(() => Effect.fail(cause)),
        ),
      ),
    );

    return {
      workspaceRoot: input.workspaceRoot,
      writtenFiles,
    } satisfies T3TeamWorkspaceContextFilesWriteResult;
  });
}

export function writeT3TeamWorkspaceContextFiles(input: {
  readonly workspaceRoot: string;
  readonly files: ReadonlyArray<T3TeamContextFileWrite>;
}) {
  return Effect.scoped(
    Effect.gen(function* () {
      yield* acquireWorkspaceWriteLock(input.workspaceRoot);
      return yield* writeT3TeamWorkspaceContextFilesUnlocked(input);
    }),
  );
}
