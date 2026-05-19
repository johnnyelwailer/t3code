import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/unstable/http";

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
import { WorkspacePaths } from "./workspace/Services/WorkspacePaths.ts";

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

      const writeEffect =
        file.encoding === "base64"
          ? fileSystem.writeFile(
              resolved.absolutePath,
              Uint8Array.from(Buffer.from(file.contents, "base64")),
            )
          : fileSystem.writeFileString(resolved.absolutePath, file.contents);

      yield* writeEffect.pipe(
        Effect.mapError(toAtlassianError("Failed to write workspace context file.")),
      );
      writtenFiles.push(resolved.relativePath);
    }

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
