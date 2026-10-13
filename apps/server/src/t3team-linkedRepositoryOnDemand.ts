/**
 * On-demand linked reference checkout: queue (or join) a background sync and wait until the
 * manifest records a settled outcome. Used when lazy bootstrap skipped eager clones.
 *
 * @module t3team-linkedRepositoryOnDemand
 */
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { LINKED_REPOSITORY_CLONE_TIMEOUT_MS } from "./t3team-linkedCheckoutGit.ts";
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
import { VcsProcess } from "./vcs/VcsProcess.ts";

const matchesRepository = (entryUrl: string, target: string): boolean =>
  repositoryLookupCandidates(entryUrl).some((candidate) =>
    repositoryLookupCandidates(target).includes(candidate),
  );

/** User-visible cap on how long hard-requirement paths wait for a pending linked clone. */
export const LINKED_REPOSITORY_ENSURE_WAIT_MS = LINKED_REPOSITORY_CLONE_TIMEOUT_MS;

export const linkedRepositoryEnsureTimedOutMessage = (repository: string, waitMs: number) =>
  `Linked repository '${repository}' checkout timed out after ${Math.round(waitMs / 1000)}s while waiting for the clone to finish. Try again or refresh linked repositories in project settings.`;

export type LinkedRepositoryOnDemandRuntime = {
  readonly sync: T3TeamLinkedRepositorySync["Service"];
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly vcsProcess: VcsProcess["Service"];
};

/** Runs {@link ensureLinkedRepositoryCheckout} with explicit services (no Effect `R` leakage). */
export const runEnsureLinkedRepositoryCheckout = (
  runtime: LinkedRepositoryOnDemandRuntime,
  input: {
    readonly workspaceRoot: string;
    readonly repository: string;
    readonly waitTimeoutMs?: number;
  },
): Effect.Effect<LinkedRepositoryBootstrapResult, string> =>
  ensureLinkedRepositoryCheckout(input).pipe(
    Effect.provideService(T3TeamLinkedRepositorySync, runtime.sync),
    Effect.provideService(FileSystem.FileSystem, runtime.fileSystem),
    Effect.provideService(Path.Path, runtime.path),
    Effect.provideService(VcsProcess, runtime.vcsProcess),
    Effect.mapError((error) => (error instanceof Error ? error.message : String(error))),
  );

export const ensureLinkedRepositoryCheckout = Effect.fn("ensureLinkedRepositoryCheckout")(
  function* (input: {
    readonly workspaceRoot: string;
    /** Repository URL or `owner/repo` full name. */
    readonly repository: string;
    readonly waitTimeoutMs?: number;
  }) {
    if (!isLazyLinkedRepositoryCheckoutEnabled()) {
      const entry = yield* readEntry(input);
      if (entry === undefined) {
        return yield* Effect.fail(
          `No linked repository matched '${input.repository}' in this project workspace.`,
        );
      }
      if (!isLinkedRepositoryReady(entry)) {
        return yield* Effect.fail(
          `Linked repository '${input.repository}' is not ready: ${entry.error ?? (entry.status === "pending" ? "it is still being cloned" : "bootstrap failed")}.`,
        );
      }
      return entry;
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
    const waitMs = input.waitTimeoutMs ?? LINKED_REPOSITORY_ENSURE_WAIT_MS;
    yield* sync.awaitSettled(localPath).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(waitMs),
        orElse: () => Effect.fail(linkedRepositoryEnsureTimedOutMessage(input.repository, waitMs)),
      }),
    );
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
}): Effect.Effect<
  LinkedRepositoryBootstrapResult | undefined,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const referencesRoot = path.join(input.workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    const manifest = yield* readPreservedReferenceManifest(
      path.join(referencesRoot, MANIFEST_FILE_NAME),
    );
    return manifest.linkedRepositories.find((entry) =>
      matchesRepository(entry.url, input.repository),
    );
  });
