/**
 * `POST /api/t3team/project/main-repository/migration`: the state-dir migration a main-repository
 * switch handed to a thread, for the workspace it migrates into (`{ migration: null }` when there
 * is none). Reads one file and at most one run row, so a client may poll it while the thread runs.
 *
 * @module t3team-projectStateMigrationRoute
 */
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { normalizeT3TeamWorkspaceRoot, toT3TeamError } from "./t3team-project-repository-utils.ts";
import { readStateMigrationStatus } from "./t3team-projectStateMigrationStatus.ts";

export const t3teamProjectStateMigrationStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/main-repository/migration",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string }>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot is required." });
    }
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    return okJson(yield* readStateMigrationStatus(workspaceRoot));
  }).pipe(
    Effect.mapError((cause) =>
      toT3TeamError(cause, "Failed to read the project state migration status."),
    ),
    Effect.catch(errorResponse),
  ),
);
