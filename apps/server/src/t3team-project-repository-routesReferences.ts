/**
 * The reference-repository step of the project workspace bootstrap (split out of
 * `t3team-project-repository-routes.ts`): records the linked repositories (they sync on demand;
 * the syncs asked for are queued in the background, never awaited), reports main-repository
 * candidates, and rewrites the reference manifest (a saved list replaces the recorded one).
 *
 * @module t3team-project-repository-routesReferences
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { toAtlassianError } from "./t3team-atlassian-http.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import { writeReferenceManifest } from "./t3team-project-repository-services.ts";
import {
  planLinkedRepositoriesForBootstrap,
  readPreservedReferenceManifest,
  resolveManifestLinkedRepositories,
} from "./t3team-project-repository-routesBootstrap.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import {
  detectMainRepositoryCandidatesWithRemote,
  mergeMainRepositoryCandidates,
  recordMainRepositoryInspectionCandidates,
  withMainRepositoryInspectionClaim,
} from "./t3team-mainRepositoryInspection.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  normalizeRepositoryUrls,
  REFERENCES_DIR_NAME,
  withSyncState,
  type BootstrapWorkspaceResponse,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { detectMainRepositoryCandidates } from "./t3team-projectMainRepositoryState.ts";
import { repositoryLookupCandidates } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

export const bootstrapWorkspaceReferences = Effect.fn("bootstrapWorkspaceReferences")(
  function* (input: {
    readonly workspaceRoot: string;
    readonly workspaceRepositoryInitialized: boolean;
    readonly detectedMainRepository: MainRepositoryBootstrapResult | undefined;
    readonly linkedRepositoryUrls: ReadonlyArray<string> | undefined;
    /** The branch each linked checkout should be on, by URL; undefined keeps what is recorded. */
    readonly linkedRepositoryBranches?: Readonly<Record<string, string>>;
    /** Linked repositories to clone/fetch now; every other one is only recorded. */
    readonly syncLinkedRepositoryUrls?: ReadonlyArray<string>;
    /** Project creation: also find main-repository candidates among linked repositories that are
     * not cloned, from their committed default branch. Never set on recurring bootstraps. */
    readonly inspectLinkedRepositoriesForMainRepository?: boolean;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { workspaceRoot, detectedMainRepository } = input;
    const referencesRoot = path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    yield* fileSystem
      .makeDirectory(referencesRoot, { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to create repository references directory.")));

    const sync = yield* T3TeamLinkedRepositorySync;
    // Under the manifest lock: a background sync settling meanwhile records its outcome after this
    // write, never under it.
    const locked = yield* sync.withManifestLock(
      Effect.gen(function* () {
        // Earlier entries survive re-bootstraps; their clones are reused, including clones
        // recorded under the previous workspace before a main-repository switch.
        const preserved = yield* readPreservedReferenceManifest(
          path.join(referencesRoot, MANIFEST_FILE_NAME),
        );
        // A switch records how this checkout became the main repository; keep that selection.
        const mainRepository: MainRepositoryBootstrapResult | undefined =
          detectedMainRepository && preserved.mainRepository?.localPath === workspaceRoot
            ? { ...detectedMainRepository, status: preserved.mainRepository.status }
            : detectedMainRepository;

        // A linked URL matching the main repository's own remote is the main repository itself,
        // not a reference clone — skip wrapping it (GHE #42 item 2).
        const mainRepositoryLookupCandidates = mainRepository?.url
          ? [...repositoryLookupCandidates(mainRepository.url)]
          : undefined;
        const linkedRepositoryUrls = normalizeRepositoryUrls(input.linkedRepositoryUrls).filter(
          (url) =>
            !mainRepositoryLookupCandidates?.some((candidate) =>
              repositoryLookupCandidates(url).includes(candidate),
            ),
        );
        // No git here: the clones and fetches asked for are queued and run in the background.
        const planned = yield* planLinkedRepositoriesForBootstrap({
          referencesRoot,
          urls: linkedRepositoryUrls,
          preserved: preserved.linkedRepositories,
          syncUrls: input.syncLinkedRepositoryUrls ?? [],
          ...(input.linkedRepositoryBranches ? { branches: input.linkedRepositoryBranches } : {}),
          phaseOf: sync.phase,
        });
        // A save sends the full list: it replaces the manifest's, so removals stick.
        const manifestLinkedRepositories = resolveManifestLinkedRepositories({
          preserved: preserved.linkedRepositories,
          fresh: planned.map((item) => item.entry),
          explicitList: input.linkedRepositoryUrls !== undefined,
        });
        const detecting = !mainRepository && isMainRepositoryEnabled();
        const localCandidates = detecting
          ? yield* detectMainRepositoryCandidates(manifestLinkedRepositories)
          : [];
        // Once per project: a completed inspection is recorded and never repeated; until then
        // (none yet, or the last one could not read a remote) a creation bootstrap inspects.
        const recordedInspection = preserved.mainRepositoryInspection;
        const shouldInspect =
          detecting &&
          input.inspectLinkedRepositoriesForMainRepository === true &&
          recordedInspection === undefined;
        const mainRepositoryInspection = recordedInspection;

        yield* writeReferenceManifest(referencesRoot, {
          workspaceRoot,
          workspaceRepositoryInitialized: input.workspaceRepositoryInitialized,
          referencesRoot,
          linkedRepositories: manifestLinkedRepositories,
          ...(mainRepository ? { mainRepository } : {}),
          ...(mainRepositoryInspection ? { mainRepositoryInspection } : {}),
          updatedAt: DateTime.formatIso(yield* DateTime.now),
        });
        for (const item of planned) {
          if (!item.request) continue;
          yield* sync.request({
            referencesRoot,
            url: item.entry.url,
            localPath: item.entry.localPath,
            ...(item.entry.branch ? { branch: item.entry.branch } : {}),
          });
        }

        const response: BootstrapWorkspaceResponse = {
          workspaceRoot,
          workspaceRepositoryInitialized: input.workspaceRepositoryInitialized,
          referencesRoot,
          linkedRepositories: planned.map((item) =>
            withSyncState(item.entry, sync.phase(item.entry.localPath)),
          ),
          ...(mainRepository ? { mainRepository } : {}),
        };
        // The creation bootstrap reports what an earlier inspection found; others stay local.
        const recordedCandidates =
          input.inspectLinkedRepositoriesForMainRepository === true
            ? (recordedInspection?.candidates ?? [])
            : [];
        return {
          response,
          manifestLinkedRepositories,
          shouldInspect,
          localCandidates,
          recordedCandidates,
        };
      }),
    );
    // Outside the manifest lock: it reads remotes. A concurrent creation holding the in-flight
    // claim makes this one skip; the marker is written only when every remote was read.
    const inspection = locked.shouldInspect
      ? yield* withMainRepositoryInspectionClaim(
          referencesRoot,
          detectMainRepositoryCandidatesWithRemote(locked.manifestLinkedRepositories),
        )
      : Option.none();
    if (Option.isSome(inspection) && inspection.value.complete) {
      yield* sync.withManifestLock(
        recordMainRepositoryInspectionCandidates(
          referencesRoot,
          DateTime.formatIso(yield* DateTime.now),
          inspection.value.candidates,
        ),
      );
    }
    const mainRepositoryCandidates = mergeMainRepositoryCandidates(
      locked.localCandidates,
      Option.isSome(inspection) ? inspection.value.candidates : locked.recordedCandidates,
    );
    return {
      ...locked.response,
      ...(mainRepositoryCandidates.length > 0 ? { mainRepositoryCandidates } : {}),
    } satisfies BootstrapWorkspaceResponse;
  },
);
