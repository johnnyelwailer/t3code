/**
 * Worktree-isolation resolution for `t3team.thread.start_child` (split out of
 * `t3team-toolBrokerStartChild.ts` for the additive LOC budget): given the
 * parsed start-child args, decides which repository (linked, local, or adopted
 * meta-repo) the child isolates in and creates its dedicated worktree.
 * Returns nulls for the shared-isolation case. Behavior unchanged.
 *
 * @module t3team-toolBrokerStartChildWorktree
 */
import * as Effect from "effect/Effect";

import type { T3TeamStartChildArgs } from "./t3team-toolBrokerStartChildArgs.ts";
import {
  hasLinkedRepositoryStartChildServices,
  linkedRepositoryManifestExists,
  readMetaRepositoryFromWorkspace,
  type T3TeamStartChildServices,
} from "./t3team-toolBrokerStartChildContext.ts";
import { repositoryLookupCandidates } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { resolveLinkedRepositoryWorktree } from "./t3team-toolBrokerStartChildLinkedWorktree.ts";
import { resolveLocalRepositoryWorktree } from "./t3team-toolBrokerStartChildLocalWorktree.ts";

export interface StartChildWorktreeResolution {
  readonly repoFullName: string | null;
  readonly repoRef: string | null;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}

export const resolveStartChildWorktree = (input: {
  readonly services: Partial<T3TeamStartChildServices>;
  readonly projectWorkspaceRoot: string;
  readonly args: T3TeamStartChildArgs;
  readonly childThreadId: string;
}): Effect.Effect<StartChildWorktreeResolution, string> =>
  Effect.gen(function* () {
    let repoFullName: string | null = null,
      repoRef: string | null = null,
      branch: string | null = null,
      worktreePath: string | null = null;
    const { args } = input;

    if (args.isolation === "own-worktree") {
      if (!hasLinkedRepositoryStartChildServices(input.services)) {
        return yield* Effect.fail(
          "t3team.thread.start_child worktree isolation is unavailable in this runtime.",
        );
      }

      const manifestExists = yield* linkedRepositoryManifestExists({
        services: input.services,
        projectWorkspaceRoot: input.projectWorkspaceRoot,
      });

      // Adopted meta-repo (monorepo project, GHE #42): the manifest carries a `metaRepository`
      // entry — sub-work happens in worktrees of the workspace repository itself. Legacy
      // wrapped projects have no such entry and keep the linked-repo-only behavior.
      const metaRepository = manifestExists
        ? yield* readMetaRepositoryFromWorkspace({
            services: input.services,
            projectWorkspaceRoot: input.projectWorkspaceRoot,
          })
        : undefined;
      const requestedRepoIsMetaRepository =
        metaRepository?.url !== undefined &&
        args.repoFullName !== undefined &&
        repositoryLookupCandidates(metaRepository.url).some((candidate) =>
          repositoryLookupCandidates(args.repoFullName as string).includes(candidate),
        );

      if (args.repoFullName) {
        if (!manifestExists) {
          return yield* Effect.fail(
            `This project workspace has no linked repositories, so 'repo_full_name' cannot be used. Omit 'repo_full_name' to isolate the child in a worktree of the local repository, or use isolation='shared' for the shared checkout.`,
          );
        }

        if (requestedRepoIsMetaRepository) {
          const resolvedMetaRepository = yield* resolveLocalRepositoryWorktree({
            services: input.services,
            projectWorkspaceRoot: input.projectWorkspaceRoot,
            ...(args.repoRef ? { repoRef: args.repoRef } : {}),
            sessionName: args.name,
            childThreadId: input.childThreadId,
          });
          ({ repoFullName, repoRef, branch, worktreePath } = {
            repoFullName: metaRepository?.url ?? args.repoFullName,
            ...resolvedMetaRepository,
          });
        } else {
          const resolvedRepository = yield* resolveLinkedRepositoryWorktree({
            services: input.services,
            projectWorkspaceRoot: input.projectWorkspaceRoot,
            repoFullName: args.repoFullName,
            ...(args.repoRef ? { repoRef: args.repoRef } : {}),
            sessionName: args.name,
            childThreadId: input.childThreadId,
          });
          ({ repoFullName, repoRef, branch, worktreePath } = resolvedRepository);
        }
      } else {
        if (manifestExists && !metaRepository) {
          return yield* Effect.fail(
            `This project has linked repositories; pass 'repo_full_name' to choose which one the child isolates in a worktree, or use isolation='shared' to run it in the shared project workspace.`,
          );
        }

        const resolvedLocalRepository = yield* resolveLocalRepositoryWorktree({
          services: input.services,
          projectWorkspaceRoot: input.projectWorkspaceRoot,
          ...(args.repoRef ? { repoRef: args.repoRef } : {}),
          sessionName: args.name,
          childThreadId: input.childThreadId,
        });
        ({ repoRef, branch, worktreePath } = resolvedLocalRepository);
        if (metaRepository) {
          repoFullName = metaRepository.url ?? null;
        }
      }
    }

    return { repoFullName, repoRef, branch, worktreePath };
  });
