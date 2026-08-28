import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import type { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
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
  findLinkedRepository,
  readLinkedRepositories,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";

const LinkedRepositoryManifestJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeLinkedRepositoryManifest = Schema.decodeEffect(
  Schema.fromJsonString(LinkedRepositoryManifestJson),
);

/** The optional `metaRepository` entry of a reference manifest: present when the workspace
 * root is itself an adopted git repository (monorepo / meta-repo, GHE #42) instead of a
 * synthetic container wrapping reference clones. */
export const metaRepositoryFromManifestJson = (manifestJson: string) => {
  try {
    const parsed = globalThis.JSON.parse(manifestJson) as { metaRepository?: unknown };
    const candidate = parsed.metaRepository;
    if (typeof candidate !== "object" || candidate === null) return undefined;
    const entry = candidate as { localPath?: unknown; url?: unknown; status?: unknown };
    if (typeof entry.localPath !== "string" || entry.localPath.trim().length === 0) {
      return undefined;
    }
    return {
      ...(typeof entry.url === "string" && entry.url.trim().length > 0
        ? { url: entry.url.trim() }
        : {}),
      localPath: entry.localPath,
    };
  } catch {
    return undefined;
  }
};

/** Reads the adopted meta-repo entry from the project workspace's reference manifest, when
 * one exists. Returns undefined for legacy wrapped projects (no entry) or workspaces without
 * a manifest. */
export const readMetaRepositoryFromWorkspace = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const manifestPath = input.services.path.join(
      input.projectWorkspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      MANIFEST_FILE_NAME,
    );
    const exists = yield* input.services.fileSystem
      .exists(manifestPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return undefined;
    const manifestText = yield* input.services.fileSystem
      .readFileString(manifestPath)
      .pipe(Effect.orElseSucceed(() => ""));
    return metaRepositoryFromManifestJson(manifestText);
  });

export type T3TeamStartChildServices = {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly sourceControlProviders: SourceControlProviderRegistry["Service"];
  readonly gitWorkflow: GitWorkflowService["Service"];
  readonly projectSetupScriptRunner: ProjectSetupScriptRunner["Service"];
  /** Live provider snapshots, used to resolve a cross-provider child model selection. */
  readonly listProviders: () => Effect.Effect<ReadonlyArray<ServerProvider>>;
  /** Resolves the launching thread of the workflow run that spawned `threadId` (undefined
   * when the caller is not a live run's child) — see the workflow-engine registry. */
  readonly workflowLaunchThreadForChild: (threadId: string) => string | undefined;
};

export type T3TeamStartChildLinkedRepositoryServices = Pick<
  T3TeamStartChildServices,
  "fileSystem" | "path" | "sourceControlProviders" | "gitWorkflow"
>;

export const hasLinkedRepositoryStartChildServices = (
  services: Partial<T3TeamStartChildServices>,
): services is T3TeamStartChildLinkedRepositoryServices =>
  services.fileSystem !== undefined &&
  services.path !== undefined &&
  services.gitWorkflow !== undefined &&
  services.sourceControlProviders !== undefined;

export const hasProjectSetupScriptRunner = (
  services: Partial<T3TeamStartChildServices>,
): services is Pick<T3TeamStartChildServices, "projectSetupScriptRunner"> =>
  services.projectSetupScriptRunner !== undefined;

/** Whether the project workspace carries linked-repository metadata — the context switch that
 * decides which isolation mechanisms `t3team.thread.start_child` can offer. */
export const linkedRepositoryManifestExists = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
}) =>
  input.services.fileSystem
    .exists(
      input.services.path.join(
        input.projectWorkspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
        MANIFEST_FILE_NAME,
      ),
    )
    .pipe(Effect.orElseSucceed(() => false));

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
  readonly childThreadId: string;
  /** Display name for the scoped worktree directory; defaults to the workspace directory name. */
  readonly repositoryName?: string;
}) =>
  Effect.gen(function* () {
    const { fileSystem, path, gitWorkflow, sourceControlProviders } = input.services;
    const workspaceRoot = input.projectWorkspaceRoot;

    const provider = yield* sourceControlProviders
      .resolve({ cwd: workspaceRoot })
      .pipe(
        Effect.mapError(
          () =>
            new Error(
              `Project workspace '${workspaceRoot}' is not a git repository (or submodule), so a local worktree cannot be created. Use isolation='shared' to run the child in the shared checkout.`,
            ),
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
      childThreadId: input.childThreadId,
    });

    yield* fileSystem.makeDirectory(path.dirname(scopedWorktreePath), { recursive: true });

    const worktree = yield* gitWorkflow.createWorktree({
      cwd: workspaceRoot,
      refName: baseRef.trim().length > 0 ? baseRef.trim() : "main",
      newRefName: buildChildBranchName(input.sessionName),
      path: scopedWorktreePath,
    });

    return {
      repoRef: baseRef,
      branch: worktree.worktree.refName,
      worktreePath: worktree.worktree.path,
    };
  });

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

/** The child worktree's setup-script phase as one call: no worktree → not requested; no
 * runner service → failed; otherwise run and map the runner's result. Extracted from
 * `makeStartChildThread` (additive LOC budget) — behavior unchanged. */
export const resolveStartChildSetupScript = (input: {
  readonly services: Partial<T3TeamStartChildServices>;
  readonly threadId: import("@t3tools/contracts").ThreadId;
  readonly projectId: string;
  readonly worktreePath: string | null;
}): Effect.Effect<{
  readonly setupScriptStatus: "not-requested" | "no-script" | "started" | "failed";
  readonly setupScriptTerminalId: string | null;
}> =>
  Effect.gen(function* () {
    if (!input.worktreePath) {
      return { setupScriptStatus: "not-requested" as const, setupScriptTerminalId: null };
    }
    if (!hasProjectSetupScriptRunner(input.services)) {
      return { setupScriptStatus: "failed" as const, setupScriptTerminalId: null };
    }
    const setupResult = yield* startProjectSetupScript({
      services: input.services,
      threadId: input.threadId,
      projectId: input.projectId,
      worktreePath: input.worktreePath,
    });
    return {
      setupScriptStatus:
        setupResult.status === "started"
          ? ("started" as const)
          : setupResult.status === "no-script"
            ? ("no-script" as const)
            : ("failed" as const),
      setupScriptTerminalId: setupResult.status === "started" ? setupResult.terminalId : null,
    };
  });

export const startProjectSetupScript = (input: {
  readonly services: Pick<T3TeamStartChildServices, "projectSetupScriptRunner">;
  readonly threadId: import("@t3tools/contracts").ThreadId;
  readonly projectId: string;
  readonly worktreePath: string;
}) =>
  input.services.projectSetupScriptRunner.runForThread(input).pipe(
    Effect.match({
      onFailure: (error) => ({
        status: "failed" as const,
        message: error.message,
      }),
      onSuccess: (result) => result,
    }),
  );
