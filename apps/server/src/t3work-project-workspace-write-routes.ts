import * as Effect from "effect/Effect";
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
import { writeT3workWorkspaceContextFiles } from "./t3work-project-workspace-context-files.ts";

export const t3workProjectWorkspaceWriteContextFilesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-files",
  Effect.gen(function* () {
    const input = yield* readJsonBody<WriteContextFilesRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "workspaceRoot is required." });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    const response: WriteContextFilesResponse = yield* writeT3workWorkspaceContextFiles({
      workspaceRoot,
      files: input.files,
    }).pipe(Effect.mapError(toAtlassianError("Failed to write workspace context files.")));
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to write workspace context files.")),
    Effect.catch(errorResponse),
  ),
);
