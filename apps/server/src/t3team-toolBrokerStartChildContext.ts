import type { ServerProvider } from "@t3tools/contracts";
// @effect-diagnostics globalErrorInEffectFailure:off -- legacy fork file; error tagging tracked separately.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import type { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";

import {
  normalizeReferenceManifestJson,
  readNormalizedReferenceManifest,
} from "./t3team-referenceManifestNormalization.ts";

import { ensureNexiProjectStateDir } from "./t3team-projectMainRepositoryState.ts";

const MAIN_REPOSITORY_STATUSES: ReadonlyArray<MainRepositoryBootstrapResult["status"]> = [
  "adopted",
  "detected",
  "user",
];

/** The optional `mainRepository` entry of a reference manifest: present when the workspace
 * root is itself the project's main repository (adopted monorepo, GHE #42, or a linked clone
 * made the workspace) instead of a synthetic container wrapping reference clones. */
export const mainRepositoryFromManifestJson = (
  manifestJson: string,
): MainRepositoryBootstrapResult | undefined => {
  try {
    const parsed = globalThis.JSON.parse(normalizeReferenceManifestJson(manifestJson)) as {
      mainRepository?: unknown;
    };
    const candidate = parsed.mainRepository;
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
      status: MAIN_REPOSITORY_STATUSES.find((status) => status === entry.status) ?? "adopted",
    };
  } catch {
    return undefined;
  }
};

/** Reads the adopted main repository entry from the project workspace's reference manifest, when
 * one exists. Returns undefined for legacy wrapped projects (no entry) or workspaces without
 * a manifest. */
export const readMainRepositoryFromWorkspace = (input: {
  readonly services: T3TeamStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
}) =>
  Effect.gen(function* () {
    yield* ensureNexiProjectStateDir(input.projectWorkspaceRoot).pipe(
      Effect.provideService(FileSystem.FileSystem, input.services.fileSystem),
      Effect.provideService(Path.Path, input.services.path),
    );
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
    const manifestText = yield* readNormalizedReferenceManifest(
      input.services.fileSystem,
      manifestPath,
    );
    return mainRepositoryFromManifestJson(manifestText);
  });

export type T3TeamStartChildServices = {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly sourceControlProviders: SourceControlProviderRegistry["Service"];
  readonly gitWorkflow: GitWorkflowService["Service"];
  readonly projectSetupScriptRunner: ProjectSetupScriptRunner["Service"];
  /** Live provider snapshots, used to resolve a cross-provider child model selection. */
  readonly listProviders: () => Effect.Effect<ReadonlyArray<ServerProvider>>;
  /** This server's own EnvironmentId (resolved once at wiring time) — used to tell a
   * same-environment `environment` argument (no-op binding) apart from a cross-environment one. */
  readonly localEnvironmentId?: string;
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
  Effect.gen(function* () {
    yield* ensureNexiProjectStateDir(input.projectWorkspaceRoot).pipe(
      Effect.provideService(FileSystem.FileSystem, input.services.fileSystem),
      Effect.provideService(Path.Path, input.services.path),
    );
    return yield* input.services.fileSystem
      .exists(
        input.services.path.join(
          input.projectWorkspaceRoot,
          HIDDEN_T3TEAM_DIR,
          REFERENCES_DIR_NAME,
          MANIFEST_FILE_NAME,
        ),
      )
      .pipe(Effect.orElseSucceed(() => false));
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
