/**
 * `POST /api/t3team/project/workspace/linked-repositories/sync`: a user's "Sync now" on one linked
 * repository — clone it when absent, fetch it when present. Returns once the sync is queued; the
 * client follows it through the status route.
 *
 * @module t3team-project-repository-routesSync
 */
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { syncLinkedRepositoryOnDemand } from "./t3team-linkedRepositoryOnDemand.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import {
  normalizeT3TeamWorkspaceRoot,
  toT3TeamError,
  withSyncState,
} from "./t3team-project-repository-utils.ts";

export const t3teamLinkedRepositorySyncRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/linked-repositories/sync",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{
      readonly workspaceRoot?: string;
      readonly url?: string;
    }>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const url = input.url?.trim() ?? "";
    if (workspaceRootInput.length === 0 || url.length === 0)
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot and url are required." });
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    const { entry } = yield* syncLinkedRepositoryOnDemand({
      workspaceRoot,
      repository: url,
      wait: false,
    });
    const sync = yield* T3TeamLinkedRepositorySync;
    return okJson({ linkedRepository: withSyncState(entry, sync.phase(entry.localPath)) });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to sync the linked repository.")),
    Effect.catch(errorResponse),
  ),
);
