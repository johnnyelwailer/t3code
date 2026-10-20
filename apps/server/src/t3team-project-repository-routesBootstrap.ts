/**
 * Sub-logic for the project workspace bootstrap route (split out of
 * `t3team-project-repository-routes.ts`): the tolerant reference-manifest
 * decoder, the linked-repository plan (no git: linked repositories sync on demand, and the clones
 * and fetches asked for run in the background, see `t3team-linkedRepositorySync`), and the
 * preserved-manifest read
 * that keeps entries alive across re-bootstraps (GHE #42) and across a
 * main-repository switch, whose new workspace reuses the clones recorded here.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  deriveReferenceDirectoryName,
  type LinkedRepositoryBootstrapResult,
  type LinkedRepositorySyncPhase,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { findExistingLinkedCheckout } from "./t3team-linkedRepositoryExistingCheckout.ts";
import {
  findLinkedRepository,
  isSameRepository,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { mainRepositoryFromManifestJson } from "./t3team-toolBrokerStartChildContext.ts";

import { readNormalizedReferenceManifest } from "./t3team-referenceManifestNormalization.ts";
import {
  mainRepositoryInspectionFromManifestJson,
  type MainRepositoryInspection,
} from "./t3team-mainRepositoryInspection.ts";

/** Tolerant read of the `linkedRepositories` array from a persisted reference manifest. */
const ReferenceManifestLinkedRepositoriesJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeReferenceManifestLinkedRepositories = Schema.decodeEffect(
  Schema.fromJsonString(ReferenceManifestLinkedRepositoriesJson),
);

export type PlannedLinkedRepository = {
  /** The manifest entry as persisted now; a sync replaces it when it settles. */
  readonly entry: LinkedRepositoryBootstrapResult;
  /** A sync of this checkout is already queued or running. */
  readonly phase?: LinkedRepositorySyncPhase;
  /** Queue (or join) a clone/fetch for this checkout. */
  readonly request: boolean;
};

/** Decides each linked repository's checkout path and whether to sync it now — without running
 * git. Linked repositories sync on demand: a bootstrap only records them, and syncs the ones named
 * in `syncUrls` (an explicit user choice) or whose chosen branch changed. A usable checkout already
 * on disk is kept, never refetched here; one on disk that is not recorded as usable yet is adopted
 * with a single fetch. */
export const planLinkedRepositoriesForBootstrap = Effect.fn("planLinkedRepositoriesForBootstrap")(
  function* (input: {
    readonly referencesRoot: string;
    readonly urls: ReadonlyArray<string>;
    readonly preserved: ReadonlyArray<LinkedRepositoryBootstrapResult>;
    /** Repositories to clone/fetch now. */
    readonly syncUrls: ReadonlyArray<string>;
    /** The branch each repository should be on, by URL; undefined keeps the recorded choice. */
    readonly branches?: Readonly<Record<string, string>>;
    readonly phaseOf: (localPath: string) => LinkedRepositorySyncPhase | undefined;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const planned: PlannedLinkedRepository[] = [];
    for (const [index, url] of input.urls.entries()) {
      const previous = findLinkedRepository(input.preserved, url);
      const previousIsClone = previous?.localPath
        ? yield* fileSystem
            .exists(path.join(previous.localPath, ".git"))
            .pipe(Effect.orElseSucceed(() => false))
        : false;
      // A recorded clone is reused (possibly under another workspace's state dir, after a
      // main-repository switch); so is a recorded path a sync is running on, so it is found.
      const recordedPath =
        previous?.localPath && (previousIsClone || input.phaseOf(previous.localPath))
          ? previous.localPath
          : undefined;
      const onDiskPath =
        recordedPath === undefined
          ? yield* findExistingLinkedCheckout({
              referencesRoot: input.referencesRoot,
              url,
              taken: new Set(planned.map((item) => item.entry.localPath)),
            })
          : undefined;
      const localPath =
        recordedPath ??
        onDiskPath ??
        path.join(
          input.referencesRoot,
          `${String(index + 1).padStart(2, "0")}-${deriveReferenceDirectoryName(url)}`,
        );
      const phase = input.phaseOf(localPath);
      const branch = input.branches ? input.branches[url] : previous?.branch;
      // A recorded settled state stands while its checkout does; anything else (a new repository,
      // a vanished clone, a legacy `pending` whose sync is gone) is not cloned until asked for.
      // An unrecorded checkout found on disk is not trusted without git: the next sync adopts it.
      const keepsRecordedState =
        previous !== undefined &&
        previous.localPath === localPath &&
        (previousIsClone || previous.status === "failed" || phase !== undefined);
      const { branch: _previousBranch, ...entryWithoutBranch } = keepsRecordedState
        ? stripSyncState({ ...previous, url })
        : ({ url, localPath, status: "not-cloned" } satisfies LinkedRepositoryBootstrapResult);
      const entry: LinkedRepositoryBootstrapResult = {
        ...entryWithoutBranch,
        ...(branch ? { branch } : {}),
      };
      // Choosing another branch is an explicit request to put the checkout on it.
      const branchChanged = input.branches !== undefined && previous?.branch !== branch;
      // A checkout on disk not recorded as usable (a legacy `pending` entry whose clone landed, or
      // a clone found after its entry was lost) is adopted once: one fetch, which also checks its
      // origin. Afterwards it is `updated` (or `failed`) and never synced here again.
      const unadoptedCheckout =
        (previousIsClone || onDiskPath !== undefined) &&
        (entry.status === "pending" || entry.status === "not-cloned");
      const requested = input.syncUrls.some((candidate) => isSameRepository(candidate, url));
      planned.push({
        entry,
        ...(phase ? { phase } : {}),
        // A running sync is still requested: that registers this manifest for its outcome
        // (the sync service deduplicates the work).
        request: phase !== undefined || requested || branchChanged || unadoptedCheckout,
      });
    }
    return planned;
  },
);

const stripSyncState = ({
  syncState: _syncState,
  ...entry
}: LinkedRepositoryBootstrapResult): LinkedRepositoryBootstrapResult => entry;

/** The manifest's linked repositories after a bootstrap. An explicit list (a user save) is
 * authoritative: a repository the user removed leaves the manifest, so it cannot come back on the
 * next read (it used to be kept forever and re-appeared after every removal). Without a list
 * (a recurring bootstrap that only re-records) earlier entries are kept, see
 * {@link mergeLinkedRepositoryEntries}. */
export function resolveManifestLinkedRepositories(input: {
  readonly preserved: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly fresh: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly explicitList: boolean;
}): ReadonlyArray<LinkedRepositoryBootstrapResult> {
  return input.explicitList
    ? [...input.fresh]
    : mergeLinkedRepositoryEntries(input.preserved, input.fresh);
}

/** Earlier manifest entries, each replaced by this bootstrap's result for the same repository;
 * repositories new to the manifest are appended. */
export function mergeLinkedRepositoryEntries(
  preserved: ReadonlyArray<LinkedRepositoryBootstrapResult>,
  fresh: ReadonlyArray<LinkedRepositoryBootstrapResult>,
): ReadonlyArray<LinkedRepositoryBootstrapResult> {
  const kept = preserved.map((entry) => findLinkedRepository(fresh, entry.url) ?? entry);
  const added = fresh.filter((entry) => !findLinkedRepository(preserved, entry.url));
  return [...kept, ...added];
}

export type PreservedReferenceManifest = {
  readonly linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly mainRepository?: MainRepositoryBootstrapResult;
  readonly mainRepositoryInspection?: MainRepositoryInspection;
};

export const readPreservedReferenceManifest = Effect.fn("readPreservedReferenceManifest")(
  function* (preservedManifestPath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const preservedRaw = yield* readNormalizedReferenceManifest(fileSystem, preservedManifestPath);
    if (preservedRaw.length === 0) {
      return { linkedRepositories: [] } satisfies PreservedReferenceManifest;
    }
    const preserved = yield* decodeReferenceManifestLinkedRepositories(preservedRaw).pipe(
      Effect.orElseSucceed(() => ({ linkedRepositories: [] })),
    );
    const linkedRepositories = (preserved.linkedRepositories ?? []).filter(
      (entry): entry is LinkedRepositoryBootstrapResult =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { url?: unknown }).url === "string",
    );
    const mainRepository = mainRepositoryFromManifestJson(preservedRaw);
    const mainRepositoryInspection = mainRepositoryInspectionFromManifestJson(preservedRaw);
    return {
      linkedRepositories,
      ...(mainRepository ? { mainRepository } : {}),
      ...(mainRepositoryInspection ? { mainRepositoryInspection } : {}),
    } satisfies PreservedReferenceManifest;
  },
);
