/**
 * Linked-repository worktree resolution for `t3team.thread.start_child`
 * isolation (split out of `t3team-toolBrokerStartChildContext.ts` for the
 * additive LOC budget): creates a dedicated worktree of a LINKED repository
 * named in the start-child args. Behavior unchanged.
 *
 * @module t3team-toolBrokerStartChildLinkedWorktree
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import {
  buildChildBranchName,
  buildScopedChildWorktreePath,
  findLinkedRepository,
  readLinkedRepositories,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";
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
  readonly childThreadId: string;
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
    const linkedRepository = findLinkedRepository(
      readLinkedRepositories(manifest.linkedRepositories),
      input.repoFullName,
    );
    if (!linkedRepository) {
      return yield* Effect.fail(
        `No linked repository matched '${input.repoFullName}' in this project workspace.`,
      );
    }
    if (linkedRepository.status === "failed") {
      return yield* Effect.fail(
        `Linked repository '${input.repoFullName}' is not ready: ${linkedRepository.error ?? "bootstrap failed"}.`,
      );
    }

    const repositoryPath = linkedRepository.localPath.trim();
    if (repositoryPath.length === 0) {
      return yield* Effect.fail(
        `Linked repository '${input.repoFullName}' does not have a usable local path.`,
      );
    }

    const repositoryExists = yield* input.services.fileSystem
      .exists(repositoryPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!repositoryExists) {
      return yield* Effect.fail(
        `Linked repository '${input.repoFullName}' is missing locally at '${repositoryPath}'.`,
      );
    }

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
      childThreadId: input.childThreadId,
    });

    yield* input.services.fileSystem.makeDirectory(
      input.services.path.dirname(scopedWorktreePath),
      {
        recursive: true,
      },
    );

    const worktree = yield* input.services.gitWorkflow.createWorktree({
      cwd: repositoryPath,
      refName: typeof baseRef === "string" && baseRef.trim().length > 0 ? baseRef.trim() : "main",
      newRefName: buildChildBranchName(input.sessionName),
      path: scopedWorktreePath,
    });

    return {
      repoFullName: input.repoFullName,
      repoRef: baseRef,
      branch: worktree.worktree.refName,
      worktreePath: worktree.worktree.path,
    };
  });
