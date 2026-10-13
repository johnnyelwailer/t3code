/**
 * `POST /api/t3team/project/main-repository` — sets the project's main repository (flag
 * `NEXI_FF_MAIN_REPOSITORY`). Server-authoritative so every host gets the same switch: a small
 * state dir is migrated inline, then `project.meta.update` moves `workspaceRoot` to the main
 * repository's checkout and records the selection. A large state dir is handed to a migration
 * thread started after that update; the response carries its `stateMigration` record and returns
 * without waiting for the copy.
 *
 * Body: `{ projectId, url: string | null, selection?: "user" | "detected" }` (`url: null` = the
 * project's own workspace). Responds with the switch result.
 *
 * @module t3team-projectMainRepositoryRoute
 */
import { CommandId, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/http";

import * as ProjectService from "./project/ProjectService.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { switchProjectMainRepository } from "./t3team-projectMainRepositorySwitch.ts";
import { beginStateMigrationHandoff } from "./t3team-projectStateMigrationHandoff.ts";
import { t3teamProjectStateMigrationStatusRouteLayer } from "./t3team-projectStateMigrationRoute.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const switchRouteLayer = HttpRouter.add(
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

    // The switch rewrites reference manifests: it serializes that write (only) with bootstraps
    // and sync outcomes.
    const sync = yield* T3TeamLinkedRepositorySync;
    const result = yield* switchProjectMainRepository({
      project,
      url,
      selection: input.selection === "detected" ? "detected" : "user",
      withManifestLock: sync.withManifestLock,
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
    const { handoff, ...response } = result;
    if (handoff === undefined) return okJson(response);
    const stateMigration = yield* beginStateMigrationHandoff({
      project,
      fromRoot: project.workspaceRoot,
      toRoot: result.workspaceRoot,
      missingFilesAtLeast: handoff.missingFilesAtLeast,
    });
    return okJson({ ...response, stateMigration });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to set the project main repository.")),
    Effect.catch(errorResponse),
  ),
);

/** The switch and its migration status route; the status route only reads the record and runs. */
export const t3teamProjectMainRepositoryRouteLayer = Layer.mergeAll(
  switchRouteLayer,
  t3teamProjectStateMigrationStatusRouteLayer,
);
