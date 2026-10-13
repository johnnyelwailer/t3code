/**
 * On-demand linked reference checkout: queue (or join) a background sync and wait until the
 * manifest records a settled outcome. Used when lazy bootstrap skipped eager clones.
 *
 * @module t3team-linkedRepositoryOnDemand
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { inspectLinkedCheckout } from "./t3team-linkedCheckoutInspect.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { isLazyLinkedRepositoryCheckoutEnabled } from "./t3team-lazyLinkedRepositoryFlag.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  isLinkedRepositoryReady,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import {
  findLinkedRepository,
  repositoryLookupCandidates,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";

const matchesRepository = (entryUrl: string, target: string): boolean =>
  repositoryLookupCandidates(entryUrl).some((candidate) =>
    repositoryLookupCandidates(target).includes(candidate),
  );

export const ensureLinkedRepositoryCheckout = Effect.fn("ensureLinkedRepositoryCheckout")(
  function* (input: {
    readonly workspaceRoot: string;
    /** Repository URL or `owner/repo` full name. */
    readonly repository: string;
  }) {
    if (!isLazyLinkedRepositoryCheckoutEnabled()) {
      return yield* readEntry(input);
    }
    const entry = yield* readEntry(input);
    if (entry === undefined) {
      return yield* Effect.fail(
        `No linked repository matched '${input.repository}' in this project workspace.`,
      );
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const localPath = entry.localPath.trim();
    if (localPath.length === 0) {
      return yield* Effect.fail(
        `Linked repository '${input.repository}' does not have a usable local path.`,
      );
    }
    const onDisk =
      isLinkedRepositoryReady(entry) &&
      (yield* inspectLinkedCheckout(localPath)) === "valid" &&
      (yield* fileSystem.exists(localPath).pipe(Effect.orElseSucceed(() => false)));
    if (onDisk) return entry;

    const sync = yield* T3TeamLinkedRepositorySync;
    const referencesRoot = path.join(input.workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    yield* sync.withManifestLock(
      sync.request({
        referencesRoot,
        url: entry.url,
        localPath,
        ...(entry.branch ? { branch: entry.branch } : {}),
      }),
    );
    yield* sync.awaitSettled(localPath);
    const settled = yield* readEntry(input);
    if (settled === undefined || !isLinkedRepositoryReady(settled)) {
      return yield* Effect.fail(
        settled?.error ??
          `Linked repository '${input.repository}' is not ready after on-demand sync.`,
      );
    }
    return settled;
  },
);

const readEntry = (input: {
  readonly workspaceRoot: string;
  readonly repository: string;
}): Effect.Effect<LinkedRepositoryBootstrapResult | undefined> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const referencesRoot = path.join(input.workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    const manifest = yield* readPreservedReferenceManifest(
      path.join(referencesRoot, MANIFEST_FILE_NAME),
    );
    return manifest.linkedRepositories.find((entry) => matchesRepository(entry.url, input.repository));
  });
