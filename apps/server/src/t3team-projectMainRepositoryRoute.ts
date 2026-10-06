/**
 * `POST /api/t3team/project/main-repository` — sets the project's main repository (flag
 * `NEXI_FF_MAIN_REPOSITORY`). Server-authoritative so every host gets the same switch: the
 * state dir is migrated, then `project.meta.update` moves `workspaceRoot` to the main
 * repository's checkout and records the selection.
 *
 * Body: `{ projectId, url: string | null, selection?: "user" | "detected" }` (`url: null` = the
 * project's own workspace). Responds with the switch result.
 *
 * @module t3team-projectMainRepositoryRoute
 */
import { CommandId, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/http";

import * as ProjectService from "./project/ProjectService.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { switchProjectMainRepository } from "./t3team-projectMainRepositorySwitch.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export const t3teamProjectMainRepositoryRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/main-repository",
  Effect.gen(function* () {
    if (!isMainRepositoryEnabled()) {
      return yield* new T3TeamAtlassianError({
        message: "Project main repositories are disabled (NEXI_FF_MAIN_REPOSITORY).",
      });
    }
    const input = yield* readJsonBody<{
      readonly projectId?: string;
      readonly url?: string | null;
      readonly selection?: string;
    }>();
    const projectId = input.projectId?.trim() ?? "";
    const url = typeof input.url === "string" ? input.url.trim() : null;
    if (projectId.length === 0 || url === "") {
      return yield* new T3TeamAtlassianError({
        message: "projectId is required, and url must be a repository URL or null.",
      });
    }
    const projects = yield* ProjectService.ProjectService;
    const project = Option.getOrUndefined(yield* projects.getShell(ProjectId.make(projectId)));
    if (!project) {
      return yield* new T3TeamAtlassianError({ message: `Project '${projectId}' was not found.` });
    }

    const result = yield* switchProjectMainRepository({
      project,
      url,
      selection: input.selection === "detected" ? "detected" : "user",
    });
    if (result.changed && result.mainRepository) {
      yield* projects.update({
        commandId: CommandId.make(`server:t3team:main-repository:${t3teamRandomUUID()}`),
        projectId: project.id,
        ...(result.workspaceRoot !== project.workspaceRoot
          ? { workspaceRoot: result.workspaceRoot }
          : {}),
        mainRepository: result.mainRepository,
      });
    }
    return okJson(result);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to set the project main repository.")),
    Effect.catch(errorResponse),
  ),
);
