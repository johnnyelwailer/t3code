/**
 * Local-repository worktree resolution for delegate_task workspace isolation
 * (`t3team-delegateTaskWorkspace.ts`): creates a dedicated worktree of the LOCAL
 * repository (or adopted meta-repo) at the project workspace root.
 *
 * @module t3team-toolBrokerStartChildLocalWorktree
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ensureWorkspaceGitignore } from "./t3team-project-repository-services.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  META_REPOSITORY_GITIGNORE_ENTRIES,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import {
  buildChildBranchName,
  buildScopedChildWorktreePath,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import {
  metaRepositoryFromManifestJson,
  type T3TeamStartChildLinkedRepositoryServices,
} from "./t3team-toolBrokerStartChildContext.ts";

/** Creates a dedicated worktree of the LOCAL repository (or submodule) at the project
 * workspace root — the isolation path for workspaces without a linked-repository manifest, and
 * for adopted meta-repos (monorepo projects, GHE #42) whose sub-work happens in worktrees of
 * the meta-repo itself. Mirrors `resolveLinkedRepositoryWorktree`: same branch naming, same
 * scoped path layout under `.t3team/child-session-worktrees/`, same base-ref resolution.
 * Ensures `.t3team/` is gitignored so the worktree stays invisible to the shared checkout. */
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

    // An adopted meta-repo keeps only its machine-local subpaths ignored so committed team
    // state under `.t3team/` survives (GHE #42); legacy workspaces keep the full entry.
    const metaRepositoryManifestPath = path.join(
      workspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      MANIFEST_FILE_NAME,
    );
    const metaRepositoryManifestExists = yield* fileSystem
      .exists(metaRepositoryManifestPath)
      .pipe(Effect.orElseSucceed(() => false));
    let gitignoreEntries: ReadonlyArray<string> | undefined;
    if (metaRepositoryManifestExists) {
      const manifestText = yield* fileSystem
        .readFileString(metaRepositoryManifestPath)
        .pipe(Effect.orElseSucceed(() => ""));
      if (metaRepositoryFromManifestJson(manifestText)) {
        gitignoreEntries = META_REPOSITORY_GITIGNORE_ENTRIES;
      }
    }

    yield* ensureWorkspaceGitignore(workspaceRoot, gitignoreEntries).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );

    const scopedWorktreePath = buildScopedChildWorktreePath({
      path,
      projectWorkspaceRoot: workspaceRoot,
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
 * (same request key, so same scoped path) already created. */
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
        return { branch: status.refName, worktreePath: input.worktreePath };
      }
    }
    const worktree = yield* gitWorkflow.createWorktree({
      cwd: input.cwd,
      refName: input.baseRef.trim().length > 0 ? input.baseRef.trim() : "main",
      newRefName: buildChildBranchName(input.sessionName),
      path: input.worktreePath,
    });
    return { branch: worktree.worktree.refName, worktreePath: worktree.worktree.path };
  });
