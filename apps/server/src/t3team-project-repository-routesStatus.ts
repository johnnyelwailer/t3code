/**
 * `POST /api/t3team/project/workspace/linked-repositories/status`: the linked repositories as the
 * reference manifest records them, with any background sync's live phase. Reads files only — no
 * git, no network — so a client may poll it while clones are running. It never queues a sync:
 * linked repositories sync on demand (a sync a restart dropped stays dropped until asked again).
 *
 * @module t3team-project-repository-routesStatus
 */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  normalizeT3TeamWorkspaceRoot,
  REFERENCES_DIR_NAME,
  toT3TeamError,
  withSyncState,
} from "./t3team-project-repository-utils.ts";

export const readLinkedRepositoryStatus = Effect.fn("readLinkedRepositoryStatus")(function* (
  workspaceRoot: string,
) {
  const path = yield* Path.Path;
  const sync = yield* T3TeamLinkedRepositorySync;
  const referencesRoot = path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  const manifest = yield* readPreservedReferenceManifest(
    path.join(referencesRoot, MANIFEST_FILE_NAME),
  );
  // An unfinished main-repository state migration (e.g. cut by a restart) resumes on the next
  // status read; the read itself stays file-only and returns at once.
  yield* sync.resumeStateMigration(workspaceRoot);
  const stateMigration = yield* sync.stateMigrationStatus(workspaceRoot);
  return {
    linkedRepositories: manifest.linkedRepositories.map((entry) =>
      withSyncState(entry, sync.phase(entry.localPath)),
    ),
    ...(stateMigration ? { stateMigration } : {}),
  };
});

export const t3teamLinkedRepositoryStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/linked-repositories/status",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string }>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0)
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot is required." });
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    return okJson(yield* readLinkedRepositoryStatus(workspaceRoot));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to read linked repository status.")),
    Effect.catch(errorResponse),
  ),
);
