/**
 * Worktree isolation for delegate_task `workspace: { isolation: "worktree" }`:
 * decides which repository the child branches from — a linked repository named
 * by `repository`, the adopted meta-repo (the workspace repository itself), or
 * the plain local repository — and creates the child's dedicated worktree under
 * `.t3team/child-session-worktrees/`. Failures are agent-facing messages.
 *
 * @module t3team-delegateTaskWorkspace
 */
import * as Effect from "effect/Effect";

import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import {
  linkedRepositoryManifestExists,
  readMetaRepositoryFromWorkspace,
  type T3TeamStartChildLinkedRepositoryServices,
} from "./t3team-toolBrokerStartChildContext.ts";
import { repositoryLookupCandidates } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { resolveLinkedRepositoryWorktree } from "./t3team-toolBrokerStartChildLinkedWorktree.ts";
import { resolveLocalRepositoryWorktree } from "./t3team-toolBrokerStartChildLocalWorktree.ts";

export interface DelegatedWorkspaceResolution {
  readonly repository: string | null;
  readonly baseRef: string;
  readonly branch: string;
  readonly worktreePath: string;
  /** The repository checkout the worktree belongs to. */
  readonly repositoryPath: string;
  /** True when this call created the worktree and branch; false when it reused a retry's. */
  readonly created: boolean;
}

export const resolveDelegatedWorkspace = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
  readonly repository: string | undefined;
  readonly baseRef: string | undefined;
  /** Seeds the new branch name (the child's title or task). */
  readonly branchSeed: string;
  /** Stable per delegation; keeps a retried request on the same worktree path. */
  readonly worktreeKey: string;
}): Effect.Effect<DelegatedWorkspaceResolution, string> =>
  Effect.gen(function* () {
    const { services, projectWorkspaceRoot, repository } = input;
    const common = {
      services,
      projectWorkspaceRoot,
      ...(input.baseRef === undefined ? {} : { repoRef: input.baseRef }),
      sessionName: input.branchSeed,
      worktreeKey: input.worktreeKey,
    };
    const manifestExists = yield* linkedRepositoryManifestExists({
      services,
      projectWorkspaceRoot,
    });
    // An adopted meta-repo (monorepo project) carries a `metaRepository` manifest entry: its
    // sub-work happens in worktrees of the workspace repository itself.
    const metaRepository = manifestExists
      ? yield* readMetaRepositoryFromWorkspace({ services, projectWorkspaceRoot })
      : undefined;

    if (repository !== undefined) {
      if (!manifestExists) {
        return yield* Effect.fail(
          "This project links no repositories, so workspace.repository cannot be used. Omit it to isolate the child in a worktree of the project's own repository.",
        );
      }
      const metaUrl = metaRepository?.url;
      const isMetaRepository =
        metaUrl !== undefined &&
        repositoryLookupCandidates(metaUrl).some((candidate) =>
          repositoryLookupCandidates(repository).includes(candidate),
        );
      if (!isMetaRepository) {
        const linked = yield* resolveLinkedRepositoryWorktree({
          ...common,
          repoFullName: repository,
        });
        return {
          repository: linked.repoFullName,
          baseRef: linked.repoRef,
          branch: linked.branch,
          worktreePath: linked.worktreePath,
          repositoryPath: linked.repositoryPath,
          created: linked.created,
        };
      }
    } else if (manifestExists && metaRepository === undefined) {
      return yield* Effect.fail(
        "This project links several repositories; pass workspace.repository to choose the one the child branches from, or use isolation='inherit'.",
      );
    }

    const local = yield* resolveLocalRepositoryWorktree(common);
    return {
      repository: metaRepository?.url ?? null,
      baseRef: local.repoRef,
      branch: local.branch,
      worktreePath: local.worktreePath,
      repositoryPath: local.repositoryPath,
      created: local.created,
    };
  });

/**
 * Undoes a worktree and branch this delegation created when the child was never created (the
 * dispatch was rejected). A reused worktree belongs to an earlier attempt and is left alone.
 * Best effort: a failure is logged, never raised.
 */
export const releaseDelegatedWorkspace = (
  gitWorkflow: Pick<GitWorkflowService["Service"], "removeWorktree" | "deleteLocalBranch">,
  workspace: DelegatedWorkspaceResolution,
): Effect.Effect<void> =>
  workspace.created
    ? gitWorkflow
        .removeWorktree({
          cwd: workspace.repositoryPath,
          path: workspace.worktreePath,
          force: true,
        })
        .pipe(
          Effect.andThen(
            gitWorkflow.deleteLocalBranch({
              cwd: workspace.repositoryPath,
              refName: workspace.branch,
              force: true,
            }),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("t3team.delegate-task.workspace-release-failed", {
              worktreePath: workspace.worktreePath,
              cause,
            }),
          ),
        )
    : Effect.void;

/** Short stable directory key for a delegation (FNV-1a over thread + request key). */
export const delegatedWorktreeKey = (threadId: string, requestKey: string): string => {
  let hash = 0x811c9dc5;
  for (const char of `${threadId}:${requestKey}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export const describeDelegatedWorkspace = (workspace: DelegatedWorkspaceResolution): string =>
  `Child works on branch ${workspace.branch} (from ${workspace.baseRef}` +
  `${workspace.repository === null ? "" : ` of ${workspace.repository}`}) in ${workspace.worktreePath}.`;
