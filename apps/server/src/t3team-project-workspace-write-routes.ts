import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
  toAtlassianError,
} from "./t3team-atlassian-http.ts";
import {
  normalizeT3TeamWorkspaceRoot,
  toT3TeamError,
  type WriteContextFilesRequest,
  type WriteContextFilesResponse,
} from "./t3team-project-repository-utils.ts";
import { writeT3TeamWorkspaceContextFiles } from "./t3team-project-workspace-context-files.ts";

export const t3teamProjectWorkspaceWriteContextFilesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/context-files",
  Effect.gen(function* () {
    const input = yield* readJsonBody<WriteContextFilesRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot is required." });
    }

    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    const response: WriteContextFilesResponse = yield* writeT3TeamWorkspaceContextFiles({
      workspaceRoot,
      files: input.files,
    }).pipe(Effect.mapError(toAtlassianError("Failed to write workspace context files.")));
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to write workspace context files.")),
    Effect.catch(errorResponse),
  ),
);
