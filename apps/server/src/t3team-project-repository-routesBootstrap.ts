/**
 * Sub-logic for the project workspace bootstrap route (split out of
 * `t3team-project-repository-routes.ts`): the tolerant reference-manifest
 * decoder, the linked-repository sync loop, and the preserved-manifest read
 * that keeps entries alive across re-bootstraps of an adopted meta-repo
 * (GHE #42).
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import {
  deriveReferenceDirectoryName,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { syncLinkedRepository } from "./t3team-project-repository-services.ts";

/** Tolerant read of the `linkedRepositories` array from a persisted reference manifest, used
 * to preserve entries when re-bootstrapping an adopted meta-repo (GHE #42). */
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
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const linkedRepositories: LinkedRepositoryBootstrapResult[] = [];
    for (const [index, url] of input.urls.entries()) {
      const result = yield* syncLinkedRepository({
        workspaceRoot: input.workspaceRoot,
        referencesRoot: input.referencesRoot,
        url,
        index,
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

export const readPreservedLinkedRepositories = Effect.fn("readPreservedLinkedRepositories")(
  function* (preservedManifestPath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const preservedManifestExists = yield* fileSystem
      .exists(preservedManifestPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!preservedManifestExists) return [] as ReadonlyArray<LinkedRepositoryBootstrapResult>;
    const preservedRaw = yield* fileSystem
      .readFileString(preservedManifestPath)
      .pipe(Effect.orElseSucceed(() => ""));
    const preserved = yield* decodeReferenceManifestLinkedRepositories(preservedRaw).pipe(
      Effect.orElseSucceed(() => ({ linkedRepositories: [] })),
    );
    return (preserved.linkedRepositories ?? []) as ReadonlyArray<LinkedRepositoryBootstrapResult>;
  },
);
