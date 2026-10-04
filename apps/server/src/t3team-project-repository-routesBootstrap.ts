/**
 * Sub-logic for the project workspace bootstrap route (split out of
 * `t3team-project-repository-routes.ts`): the tolerant reference-manifest
 * decoder, the linked-repository sync loop, and the preserved-manifest read
 * that keeps entries alive across re-bootstraps (GHE #42) and across a
 * main-repository switch, whose new workspace reuses the clones recorded here.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import {
  deriveReferenceDirectoryName,
  type LinkedRepositoryBootstrapResult,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { syncLinkedRepository } from "./t3team-project-repository-services.ts";
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

export const syncLinkedRepositoriesForBootstrap = Effect.fn("syncLinkedRepositoriesForBootstrap")(
  function* (input: {
    readonly workspaceRoot: string;
    readonly referencesRoot: string;
    readonly urls: ReadonlyArray<string>;
    readonly preserved: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  }) {
    const path = yield* Path.Path;
    const linkedRepositories: LinkedRepositoryBootstrapResult[] = [];
    for (const [index, url] of input.urls.entries()) {
      const previous = findLinkedRepository(input.preserved, url);
      const result = yield* syncLinkedRepository({
        workspaceRoot: input.workspaceRoot,
        referencesRoot: input.referencesRoot,
        url,
        index,
        ...(previous && previous.status !== "failed" && previous.localPath
          ? { existingLocalPath: previous.localPath }
          : {}),
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            url,
            localPath: path.join(
              input.referencesRoot,
              `${String(index + 1).padStart(2, "0")}-${deriveReferenceDirectoryName(url)}`,
            ),
            status: "failed",
            error:
              error instanceof T3TeamAtlassianError
                ? error.message
                : "Failed to sync linked repository reference.",
          } satisfies LinkedRepositoryBootstrapResult),
        ),
      );
      linkedRepositories.push(result);
    }
    return linkedRepositories;
  },
);

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
