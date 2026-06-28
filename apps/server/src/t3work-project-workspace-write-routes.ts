import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpRouter } from "effect/unstable/http";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
  toAtlassianError,
} from "./t3work-atlassian-http.ts";
import {
  normalizeT3workWorkspaceRoot,
  toT3workError,
  type WriteContextFilesRequest,
  type WriteContextFilesResponse,
} from "./t3work-project-repository-utils.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

const CONTEXT_SYNC_COMMIT_MARKER_PATH = ".t3work/context/.sync-commit.json";
const ContextSyncCommitMarkerJson = fromJsonStringPretty(
  Schema.Struct({
    kind: Schema.Literal("t3work-context-sync-commit"),
    committedAt: Schema.String,
    writtenFiles: Schema.Array(Schema.String),
  }),
);
const encodeContextSyncCommitMarker = Schema.encodeEffect(ContextSyncCommitMarkerJson);

export const t3workProjectWorkspaceWriteContextFilesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-files",
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;
    const input = yield* readJsonBody<WriteContextFilesRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "workspaceRoot is required." });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    yield* fileSystem
      .makeDirectory(workspaceRoot, { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to ensure workspace directory exists.")));

    const writtenFiles: string[] = [];
    for (const file of input.files) {
      const resolved = yield* workspacePaths
        .resolveRelativePathWithinRoot({
          workspaceRoot,
          relativePath: file.relativePath,
        })
        .pipe(Effect.mapError(toAtlassianError("Failed to resolve workspace file path.")));

      yield* fileSystem
        .makeDirectory(path.dirname(resolved.absolutePath), { recursive: true })
        .pipe(Effect.mapError(toAtlassianError("Failed to create workspace file directory.")));

      const tempPath = `${resolved.absolutePath}.${t3workRandomUUID()}.tmp`;
      const writeEffect =
        file.encoding === "base64"
          ? fileSystem.writeFile(tempPath, Uint8Array.from(Buffer.from(file.contents, "base64")))
          : fileSystem.writeFileString(tempPath, file.contents);

      yield* writeEffect.pipe(
        Effect.flatMap(() => fileSystem.rename(tempPath, resolved.absolutePath)),
        Effect.catch((cause) =>
          fileSystem.remove(tempPath, { force: true }).pipe(
            Effect.ignore,
            Effect.flatMap(() =>
              Effect.fail(toAtlassianError("Failed to write workspace context file.")(cause)),
            ),
          ),
        ),
      );
      writtenFiles.push(resolved.relativePath);
    }

    const commitMarker = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot,
        relativePath: CONTEXT_SYNC_COMMIT_MARKER_PATH,
      })
      .pipe(Effect.mapError(toAtlassianError("Failed to resolve workspace commit marker.")));
    yield* fileSystem
      .makeDirectory(path.dirname(commitMarker.absolutePath), { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to create workspace commit directory.")));
    const commitMarkerTempPath = `${commitMarker.absolutePath}.${t3workRandomUUID()}.tmp`;
    const commitMarkerContents = yield* encodeContextSyncCommitMarker({
      kind: "t3work-context-sync-commit",
      committedAt: DateTime.formatIso(yield* DateTime.now),
      writtenFiles,
    }).pipe(Effect.mapError(toAtlassianError("Failed to encode workspace commit marker.")));
    yield* fileSystem.writeFileString(commitMarkerTempPath, `${commitMarkerContents}\n`).pipe(
      Effect.flatMap(() => fileSystem.rename(commitMarkerTempPath, commitMarker.absolutePath)),
      Effect.catch((cause) =>
        fileSystem.remove(commitMarkerTempPath, { force: true }).pipe(
          Effect.ignore,
          Effect.flatMap(() =>
            Effect.fail(toAtlassianError("Failed to write workspace commit marker.")(cause)),
          ),
        ),
      ),
    );

    const response: WriteContextFilesResponse = {
      workspaceRoot,
      writtenFiles,
    };
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to write workspace context files.")),
    Effect.catch(errorResponse),
  ),
);
