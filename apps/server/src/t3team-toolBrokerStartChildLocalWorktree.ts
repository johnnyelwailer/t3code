/**
 * Local-repository worktree resolution for delegate_task workspace isolation
 * (`t3team-delegateTaskWorkspace.ts`): creates a dedicated worktree of the LOCAL
 * repository (or adopted meta-repo) at the project workspace root.
 *
 * @module t3team-toolBrokerStartChildLocalWorktree
 */
import * as Effect from "effect/Effect";

import {
  buildChildBranchName,
  buildScopedChildWorktreePath,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { resolveChildStartPoint } from "./t3team-toolBrokerStartChildStartPoint.ts";
import type { T3TeamStartChildLinkedRepositoryServices } from "./t3team-toolBrokerStartChildContext.ts";

/** Creates a dedicated worktree of the LOCAL repository (or submodule) at the project
 * workspace root — the isolation path for workspaces without a linked-repository manifest, and
 * for adopted main repositories (monorepo projects, GHE #42) whose sub-work happens in worktrees of
 * the main repository itself. Mirrors `resolveLinkedRepositoryWorktree`: same branch naming, same
 * scoped path layout under the server's worktrees directory, same base-ref resolution. */
export const resolveLocalRepositoryWorktree = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
  readonly repoRef?: string;
  readonly sessionName: string;
  readonly worktreeKey: string;
  /** Display name for the scoped worktree directory; defaults to the workspace directory name. */
  readonly repositoryName?: string;
}) =>
  Effect.gen(function* () {
    const { fileSystem, path, sourceControlProviders } = input.services;
    const workspaceRoot = input.projectWorkspaceRoot;

    const provider = yield* sourceControlProviders
      .resolve({ cwd: workspaceRoot })
      .pipe(
        Effect.mapError(
          () =>
            `Project workspace '${workspaceRoot}' is not a git repository (or submodule), so a local worktree cannot be created. Use isolation='shared' to run the child in the shared checkout.`,
        ),
      );

    const baseRef =
      input.repoRef ??
      ((yield* provider
        .getDefaultBranch({ cwd: workspaceRoot })
        .pipe(Effect.orElseSucceed(() => "main"))) ||
        "main");

    const scopedWorktreePath = buildScopedChildWorktreePath({
      path,
      worktreesRoot: input.services.worktreesRoot,
      repoFullName:
        input.repositoryName && input.repositoryName.trim().length > 0
          ? input.repositoryName
          : path.basename(workspaceRoot),
      repoRef: baseRef,
      worktreeKey: input.worktreeKey,
    });

    yield* fileSystem.makeDirectory(path.dirname(scopedWorktreePath), { recursive: true });

    const worktree = yield* createOrReuseChildWorktree({
      services: input.services,
      cwd: workspaceRoot,
      baseRef,
      sessionName: input.sessionName,
      worktreePath: scopedWorktreePath,
    });

    return { repoRef: baseRef, ...worktree };
  }).pipe(Effect.mapError((error) => (error instanceof Error ? error.message : String(error))));

/** Creates the child's worktree on a new branch, or reuses the one a retried delegation
 * (same request key, so same scoped path) already created. `created` tells which, so only the
 * call that created a worktree undoes it when its delegation fails (`releaseDelegatedWorkspace`). */
export const createOrReuseChildWorktree = (input: {
  readonly services: Pick<T3TeamStartChildLinkedRepositoryServices, "fileSystem" | "gitWorkflow">;
  readonly cwd: string;
  readonly baseRef: string;
  readonly sessionName: string;
  readonly worktreePath: string;
}) =>
  Effect.gen(function* () {
    const { fileSystem, gitWorkflow } = input.services;
    if (yield* fileSystem.exists(input.worktreePath).pipe(Effect.orElseSucceed(() => false))) {
      const status = yield* gitWorkflow.localStatus({ cwd: input.worktreePath });
      if (status.isRepo && status.refName !== null) {
        return {
          branch: status.refName,
          worktreePath: input.worktreePath,
          repositoryPath: input.cwd,
          created: false,
          startedFrom: null,
        };
      }
    }
    const baseRef = input.baseRef.trim().length > 0 ? input.baseRef.trim() : "main";
    const startPoint = yield* resolveChildStartPoint({ gitWorkflow, cwd: input.cwd, baseRef });
    const worktree = yield* gitWorkflow.createWorktree({
      cwd: input.cwd,
      refName: startPoint.refName,
      newRefName: buildChildBranchName(input.sessionName),
      baseRefName: baseRef,
      path: input.worktreePath,
    });
    return {
      branch: worktree.worktree.refName,
      worktreePath: worktree.worktree.path,
      repositoryPath: input.cwd,
      created: true,
      startedFrom: startPoint.description,
    };
  });
