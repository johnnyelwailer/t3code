/**
 * Sub-logic for the project workspace bootstrap route (split out of
 * `t3team-project-repository-routes.ts`): the tolerant reference-manifest
 * decoder, the linked-repository sync plan (no git: clones and fetches run in the background,
 * see `t3team-linkedRepositorySync`), and the preserved-manifest read
 * that keeps entries alive across re-bootstraps (GHE #42) and across a
 * main-repository switch, whose new workspace reuses the clones recorded here.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  deriveReferenceDirectoryName,
  isLinkedRepositoryReady,
  type LinkedRepositoryBootstrapResult,
  type LinkedRepositorySyncPhase,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { findLinkedRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { mainRepositoryFromManifestJson } from "./t3team-toolBrokerStartChildContext.ts";

import { readNormalizedReferenceManifest } from "./t3team-referenceManifestNormalization.ts";

/** Tolerant read of the `linkedRepositories` array from a persisted reference manifest. */
const ReferenceManifestLinkedRepositoriesJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeReferenceManifestLinkedRepositories = Schema.decodeEffect(
  Schema.fromJsonString(ReferenceManifestLinkedRepositoriesJson),
);

/** How long a settled sync (success or failure) stands before a plain bootstrap refetches. */
const LINKED_REPOSITORY_REFETCH_INTERVAL_MS = 15 * 60_000;

export type PlannedLinkedRepository = {
  /** The manifest entry as persisted now; a background sync replaces it when it settles. */
  readonly entry: LinkedRepositoryBootstrapResult;
  /** A sync of this checkout is already queued or running. */
  readonly phase?: LinkedRepositorySyncPhase;
  /** Queue (or join) a background clone/fetch for this checkout. */
  readonly request: boolean;
};

/** Decides each linked repository's checkout path and whether it needs a background sync —
 * without running git. A recent sync is not repeated unless `refresh` (an explicit save). */
export const planLinkedRepositoriesForBootstrap = Effect.fn("planLinkedRepositoriesForBootstrap")(
  function* (input: {
    readonly referencesRoot: string;
    readonly urls: ReadonlyArray<string>;
    readonly preserved: ReadonlyArray<LinkedRepositoryBootstrapResult>;
    readonly refresh: boolean;
    readonly phaseOf: (localPath: string) => LinkedRepositorySyncPhase | undefined;
    readonly nowMs: number;
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
      // main-repository switch); a pending one keeps its path so its running sync is found.
      const localPath =
        previous?.localPath && (previousIsClone || previous.status === "pending")
          ? previous.localPath
          : path.join(
              input.referencesRoot,
              `${String(index + 1).padStart(2, "0")}-${deriveReferenceDirectoryName(url)}`,
            );
      const phase = input.phaseOf(localPath);
      const syncedAtMs = previous?.syncedAt ? Date.parse(previous.syncedAt) : Number.NaN;
      const recentlySettled =
        previous?.localPath === localPath &&
        input.nowMs - syncedAtMs < LINKED_REPOSITORY_REFETCH_INTERVAL_MS &&
        (previous.status === "failed" || (isLinkedRepositoryReady(previous) && previousIsClone));
      const entry: LinkedRepositoryBootstrapResult =
        previous &&
        previous.localPath === localPath &&
        (previousIsClone || !isLinkedRepositoryReady(previous))
          ? stripSyncState({ ...previous, url })
          : { url, localPath, status: "pending" };
      planned.push({
        entry,
        ...(phase ? { phase } : {}),
        // A running sync is still requested: that registers this manifest for its outcome
        // (the sync service deduplicates the work).
        request: phase !== undefined || input.refresh || !recentlySettled,
      });
    }
    return planned;
  },
);

const stripSyncState = ({
  syncState: _syncState,
  ...entry
}: LinkedRepositoryBootstrapResult): LinkedRepositoryBootstrapResult => entry;

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
    return {
      linkedRepositories,
      ...(mainRepository ? { mainRepository } : {}),
    } satisfies PreservedReferenceManifest;
  },
);
