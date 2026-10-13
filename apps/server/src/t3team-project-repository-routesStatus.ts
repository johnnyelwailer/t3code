/**
 * `POST /api/t3team/project/workspace/linked-repositories/status`: the linked repositories as the
 * reference manifest records them, with any background sync's live phase. Reads files only — no
 * git, no network — so a client may poll it while clones are running. A `pending` entry whose
 * sync was lost to a server restart is queued again.
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
import { isLazyLinkedRepositoryCheckoutEnabled } from "./t3team-lazyLinkedRepositoryFlag.ts";
import { ensureLinkedRepositoryCheckout } from "./t3team-linkedRepositoryOnDemand.ts";
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
  // A `pending` entry with no job lost its sync to a server restart: queue it again (no git here).
  // Lazy mode: at most one opportunistic recover per poll so bootstrap does not fan out all clones.
  const pending = manifest.linkedRepositories.filter(
    (entry) => entry.status === "pending" && !sync.phase(entry.localPath),
  );
  const toRecover = isLazyLinkedRepositoryCheckoutEnabled() ? pending.slice(0, 1) : pending;
  for (const entry of toRecover) {
    yield* sync.recover({
      referencesRoot,
      url: entry.url,
      localPath: entry.localPath,
      ...(entry.branch ? { branch: entry.branch } : {}),
    });
  }
  return {
    linkedRepositories: manifest.linkedRepositories.map((entry) =>
      withSyncState(entry, sync.phase(entry.localPath)),
    ),
  };
});

export const ensureLinkedRepositoryCheckoutRoute = Effect.fn("ensureLinkedRepositoryCheckoutRoute")(
  function* (workspaceRoot: string, repository: string) {
    const entry = yield* ensureLinkedRepositoryCheckout({ workspaceRoot, repository });
    const sync = yield* T3TeamLinkedRepositorySync;
    return {
      linkedRepository: entry,
      syncState: sync.phase(entry.localPath),
    };
  },
);

export const t3teamLinkedRepositoryEnsureRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/linked-repositories/ensure",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string; readonly url?: string }>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    const url = input.url?.trim() ?? "";
    if (workspaceRootInput.length === 0 || url.length === 0) {
      return yield* new T3TeamAtlassianError({
        message: "workspaceRoot and url are required.",
      });
    }
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    return okJson(yield* ensureLinkedRepositoryCheckoutRoute(workspaceRoot, url));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to ensure linked repository checkout.")),
    Effect.catch(errorResponse),
  ),
);

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
