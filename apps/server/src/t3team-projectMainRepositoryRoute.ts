/**
 * `POST /api/t3team/project/main-repository` — sets the project's main repository (flag
 * `NEXI_FF_MAIN_REPOSITORY`). Server-authoritative so every host gets the same switch: the
 * state dir is migrated, then `project.meta.update` moves `workspaceRoot` to the main
 * repository's checkout and records the selection.
 *
 * Answers at once: the state dir is linked into the new checkout and copied by a durable
 * background job (progress: `stateMigration` here and in the linked-repository status route).
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

    // The switch only rewrites reference manifests (milliseconds); serialize it with bootstraps
    // and sync outcomes. Uninterruptible: a client that gives up must not cut the manifest write
    // and the project update apart.
    const sync = yield* T3TeamLinkedRepositorySync;
    const switched = Effect.gen(function* () {
      const result = yield* sync.withManifestLock(
        switchProjectMainRepository({
          project,
          url,
          selection: input.selection === "detected" ? "detected" : "user",
        }),
      );
      if (!result.changed || !result.mainRepository) return result;
      // 1. The record first: the switch is committed before any state moves.
      yield* projects.update({
        commandId: CommandId.make(`server:t3team:main-repository:${t3teamRandomUUID()}`),
        projectId: project.id,
        ...(result.workspaceRoot !== project.workspaceRoot
          ? { workspaceRoot: result.workspaceRoot }
          : {}),
        mainRepository: result.mainRepository,
      });
      // 2. Then the state: linked into the new checkout now, copied in the background.
      const stateMigration = yield* sync.startStateMigration({
        fromRoot: project.workspaceRoot,
        toRoot: result.workspaceRoot,
      });
      return stateMigration ? { ...result, stateMigration } : result;
    });
    return okJson(yield* Effect.uninterruptible(switched));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to set the project main repository.")),
    Effect.catch(errorResponse),
  ),
);

/** Startup: resumes every project's unfinished main-repository state migration (a restart cut
 * the background copy). Forked, so it never delays the server becoming ready. */
export const t3teamStateMigrationResumeLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const projects = yield* ProjectService.ProjectService;
    const sync = yield* T3TeamLinkedRepositorySync;
    const shells = yield* projects.listShells();
    for (const shell of shells) yield* sync.resumeStateMigration(shell.workspaceRoot);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Could not resume project state migrations.", cause),
    ),
    Effect.forkScoped,
  ),
);
