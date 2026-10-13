/**
 * Linked-repository worktree resolution for delegate_task workspace isolation
 * (`t3team-delegateTaskWorkspace.ts`): creates a dedicated worktree of a LINKED
 * repository named by `workspace.repository`.
 *
 * @module t3team-toolBrokerStartChildLinkedWorktree
 */
import * as Effect from "effect/Effect";

import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { buildScopedChildWorktreePath } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { createOrReuseChildWorktree } from "./t3team-toolBrokerStartChildLocalWorktree.ts";
import type { T3TeamStartChildLinkedRepositoryServices } from "./t3team-toolBrokerStartChildContext.ts";
import { ensureLinkedRepositoryCheckout } from "./t3team-linkedRepositoryOnDemand.ts";

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

    const linkedRepository = yield* ensureLinkedRepositoryCheckout({
      workspaceRoot: input.projectWorkspaceRoot,
      repository: input.repoFullName,
    }).pipe(
      Effect.mapError((message) =>
        typeof message === "string"
          ? message
          : message instanceof Error
            ? message.message
            : String(message),
      ),
    );
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
