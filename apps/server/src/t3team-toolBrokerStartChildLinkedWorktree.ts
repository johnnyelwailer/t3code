/**
 * Linked-repository worktree resolution for delegate_task workspace isolation
 * (`t3team-delegateTaskWorkspace.ts`): creates a dedicated worktree of a LINKED
 * repository named by `workspace.repository`. Linked repositories sync on demand: one with no
 * usable checkout yet is cloned (or fetched back into shape) here, before the worktree is made.
 *
 * @module t3team-toolBrokerStartChildLinkedWorktree
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { syncLinkedRepositoryOnDemand } from "./t3team-linkedRepositoryOnDemand.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  isLinkedRepositoryReady,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import {
  buildScopedChildWorktreePath,
  findLinkedRepository,
  readLinkedRepositories,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { createOrReuseChildWorktree } from "./t3team-toolBrokerStartChildLocalWorktree.ts";
import type { T3TeamStartChildLinkedRepositoryServices } from "./t3team-toolBrokerStartChildContext.ts";

const LinkedRepositoryManifestJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeLinkedRepositoryManifest = Schema.decodeEffect(
  Schema.fromJsonString(LinkedRepositoryManifestJson),
);

export const resolveLinkedRepositoryWorktree = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
  readonly repoFullName: string;
  readonly repoRef?: string;
  readonly sessionName: string;
  readonly worktreeKey: string;
}) =>
  Effect.gen(function* () {
    const manifestPath = input.services.path.join(
      input.projectWorkspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      MANIFEST_FILE_NAME,
    );
    const manifestExists = yield* input.services.fileSystem
      .exists(manifestPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!manifestExists) {
      return yield* Effect.fail(
        `Project workspace '${input.projectWorkspaceRoot}' does not have linked repository metadata.`,
      );
    }

    const manifestText = yield* input.services.fileSystem
      .readFileString(manifestPath)
      .pipe(Effect.mapError((error) => (error instanceof Error ? error.message : String(error))));

    const manifest = yield* decodeLinkedRepositoryManifest(manifestText).pipe(
      Effect.mapError(
        (error) =>
          `Failed to parse linked repository metadata: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    const recorded = findLinkedRepository(
      readLinkedRepositories(manifest.linkedRepositories),
      input.repoFullName,
    );
    if (!recorded) {
      return yield* Effect.fail(
        `No linked repository matched '${input.repoFullName}' in this project workspace.`,
      );
    }
    const linkedRepository = (yield* hasUsableCheckout(input.services, recorded))
      ? recorded
      : yield* cloneOnDemand(input.services, input.projectWorkspaceRoot, recorded);
    if (!(yield* hasUsableCheckout(input.services, linkedRepository))) {
      return yield* Effect.fail(
        `Linked repository '${input.repoFullName}' has no usable checkout: ${linkedRepository.error ?? "it is not cloned on this machine"}.`,
      );
    }
    const repositoryPath = linkedRepository.localPath.trim();

    const baseRef =
      input.repoRef ??
      ((yield* input.services.sourceControlProviders.resolve({ cwd: repositoryPath }).pipe(
        Effect.flatMap((provider) => provider.getDefaultBranch({ cwd: repositoryPath })),
        Effect.orElseSucceed(() => "main"),
      )) ||
        "main");

    const scopedWorktreePath = buildScopedChildWorktreePath({
      path: input.services.path,
      projectWorkspaceRoot: input.projectWorkspaceRoot,
      repoFullName: input.repoFullName,
      repoRef: baseRef,
      worktreeKey: input.worktreeKey,
    });

    yield* input.services.fileSystem.makeDirectory(
      input.services.path.dirname(scopedWorktreePath),
      {
        recursive: true,
      },
    );

    const worktree = yield* createOrReuseChildWorktree({
      services: input.services,
      cwd: repositoryPath,
      baseRef,
      sessionName: input.sessionName,
      worktreePath: scopedWorktreePath,
    });

    return { repoFullName: input.repoFullName, repoRef: baseRef, ...worktree };
  }).pipe(Effect.mapError((error) => (error instanceof Error ? error.message : String(error))));

const hasUsableCheckout = (
  services: T3TeamStartChildLinkedRepositoryServices,
  entry: LinkedRepositoryBootstrapResult,
) =>
  isLinkedRepositoryReady(entry) && entry.localPath.trim() !== ""
    ? services.fileSystem.exists(entry.localPath.trim()).pipe(Effect.orElseSucceed(() => false))
    : Effect.succeed(false);

/** Clones (or repairs) the checkout and waits for it; without the sync service, nothing changes. */
const cloneOnDemand = (
  services: T3TeamStartChildLinkedRepositoryServices,
  projectWorkspaceRoot: string,
  entry: LinkedRepositoryBootstrapResult,
) =>
  services.linkedRepositorySync === undefined
    ? Effect.succeed(entry)
    : syncLinkedRepositoryOnDemand({
        workspaceRoot: projectWorkspaceRoot,
        repository: entry.url,
        wait: true,
      }).pipe(
        Effect.map((result) => result.entry),
        Effect.provideService(T3TeamLinkedRepositorySync, services.linkedRepositorySync),
        Effect.provideService(FileSystem.FileSystem, services.fileSystem),
        Effect.provideService(Path.Path, services.path),
        Effect.mapError((error) => error.message),
      );
