/**
 * The reference-repository step of the project workspace bootstrap (split out of
 * `t3team-project-repository-routes.ts`): syncs linked clones, reports main-repository
 * candidates, and rewrites the reference manifest without dropping earlier entries.
 *
 * @module t3team-project-repository-routesReferences
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { toAtlassianError } from "./t3team-atlassian-http.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import { writeReferenceManifest } from "./t3team-project-repository-services.ts";
import {
  mergeLinkedRepositoryEntries,
  readPreservedReferenceManifest,
  syncLinkedRepositoriesForBootstrap,
} from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  normalizeRepositoryUrls,
  REFERENCES_DIR_NAME,
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
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { workspaceRoot, detectedMainRepository } = input;
    const referencesRoot = path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    yield* fileSystem
      .makeDirectory(referencesRoot, { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to create repository references directory.")));

    // Earlier entries survive re-bootstraps; their clones are reused, including clones recorded
    // under the previous workspace before a main-repository switch.
    const preserved = yield* readPreservedReferenceManifest(
      path.join(referencesRoot, MANIFEST_FILE_NAME),
    );
    // A switch records how this checkout became the main repository; keep that selection.
    const mainRepository: MainRepositoryBootstrapResult | undefined =
      detectedMainRepository && preserved.mainRepository?.localPath === workspaceRoot
        ? { ...detectedMainRepository, status: preserved.mainRepository.status }
        : detectedMainRepository;

    // A linked URL matching the main repository's own remote is the main repository itself, not
    // a reference clone — skip wrapping it (GHE #42 item 2).
    const mainRepositoryLookupCandidates = mainRepository?.url
      ? [...repositoryLookupCandidates(mainRepository.url)]
      : undefined;
    const linkedRepositoryUrls = normalizeRepositoryUrls(input.linkedRepositoryUrls).filter(
      (url) =>
        !mainRepositoryLookupCandidates?.some((candidate) =>
          repositoryLookupCandidates(url).includes(candidate),
        ),
    );
    const linkedRepositories = yield* syncLinkedRepositoriesForBootstrap({
      workspaceRoot,
      referencesRoot,
      urls: linkedRepositoryUrls,
      preserved: preserved.linkedRepositories,
    });
    const manifestLinkedRepositories = mergeLinkedRepositoryEntries(
      preserved.linkedRepositories,
      linkedRepositories,
    );
    const mainRepositoryCandidates =
      !mainRepository && isMainRepositoryEnabled()
        ? yield* detectMainRepositoryCandidates(manifestLinkedRepositories)
        : [];

    const response: BootstrapWorkspaceResponse = {
      workspaceRoot,
      workspaceRepositoryInitialized: input.workspaceRepositoryInitialized,
      referencesRoot,
      linkedRepositories,
      ...(mainRepository ? { mainRepository } : {}),
      ...(mainRepositoryCandidates.length > 0 ? { mainRepositoryCandidates } : {}),
    };
    yield* writeReferenceManifest(referencesRoot, {
      workspaceRoot,
      workspaceRepositoryInitialized: input.workspaceRepositoryInitialized,
      referencesRoot,
      linkedRepositories: manifestLinkedRepositories,
      ...(mainRepository ? { mainRepository } : {}),
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    });
    return response;
  },
);
