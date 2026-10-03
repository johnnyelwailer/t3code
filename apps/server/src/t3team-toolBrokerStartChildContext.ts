import type { ThreadId } from "@t3tools/contracts";
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

export type T3TeamStartChildLinkedRepositoryServices = {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly sourceControlProviders: SourceControlProviderRegistry["Service"];
  readonly gitWorkflow: GitWorkflowService["Service"];
};

/** Whether the project workspace carries linked-repository metadata — the context switch that
 * decides which isolation mechanisms delegate_task workspace isolation can offer. */
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

/** Starts the project's setup script in a fresh child worktree; returns an agent-facing note. */
export const startChildSetupScript = (input: {
  readonly runner: ProjectSetupScriptRunner["Service"];
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly worktreePath: string;
}): Effect.Effect<string> =>
  input.runner
    .runForThread({
      threadId: input.threadId,
      projectId: input.projectId,
      worktreePath: input.worktreePath,
    })
    .pipe(
      Effect.match({
        onFailure: (error) => `Project setup script failed to start: ${error.message}`,
        onSuccess: (result) =>
          result.status === "started"
            ? `Project setup script started in terminal ${result.terminalId}.`
            : "The project has no setup script.",
      }),
    );
