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
} from "./t3team-project-repository-utils.ts";

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
