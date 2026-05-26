import { sanitizeFeatureBranchName } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import type { GitWorkflowServiceShape } from "./git/GitWorkflowService.ts";
import type { ProjectSetupScriptRunnerShape } from "./project/Services/ProjectSetupScriptRunner.ts";
import type { SourceControlProviderRegistryShape } from "./sourceControl/SourceControlProviderRegistry.ts";
import {
  HIDDEN_T3WORK_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3work-project-repository-utils.ts";

const LinkedRepositoryManifestJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeLinkedRepositoryManifest = Schema.decodeEffect(
  Schema.fromJsonString(LinkedRepositoryManifestJson),
);

export type T3workStartChildServices = {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly sourceControlProviders: SourceControlProviderRegistryShape;
  readonly gitWorkflow: GitWorkflowServiceShape;
  readonly projectSetupScriptRunner: ProjectSetupScriptRunnerShape;
};

export type T3workStartChildLinkedRepositoryServices = Pick<
  T3workStartChildServices,
  "fileSystem" | "path" | "sourceControlProviders" | "gitWorkflow"
>;

export const hasLinkedRepositoryStartChildServices = (
  services: Partial<T3workStartChildServices>,
): services is T3workStartChildLinkedRepositoryServices =>
  services.fileSystem !== undefined &&
  services.path !== undefined &&
  services.gitWorkflow !== undefined &&
  services.sourceControlProviders !== undefined;

export const hasProjectSetupScriptRunner = (
  services: Partial<T3workStartChildServices>,
): services is Pick<T3workStartChildServices, "projectSetupScriptRunner"> =>
  services.projectSetupScriptRunner !== undefined;

function normalizeRepositoryLookupKey(value: string): string {
  const trimmed = value.trim().replace(/\.git$/i, "");
  const sshMatch = /^git@([^:]+):(.+)$/i.exec(trimmed);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2] ?? ""}`.replace(/^\/+/, "").toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname}`
      .replace(/\.git$/i, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/")
      .toLowerCase();
  } catch {
    return trimmed.replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase();
  }
}

function repositoryLookupCandidates(value: string): ReadonlyArray<string> {
  const normalized = normalizeRepositoryLookupKey(value);
  const candidates = new Set<string>([normalized]);
  const firstSlashIndex = normalized.indexOf("/");
  if (firstSlashIndex > 0 && firstSlashIndex < normalized.length - 1) {
    candidates.add(normalized.slice(firstSlashIndex + 1));
  }
  return [...candidates];
}

function findLinkedRepository(
  linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>,
  repoFullName: string,
): LinkedRepositoryBootstrapResult | undefined {
  const requestedCandidates = new Set(repositoryLookupCandidates(repoFullName));
  return linkedRepositories.find((linkedRepository) =>
    repositoryLookupCandidates(linkedRepository.url).some((candidate) =>
      requestedCandidates.has(candidate),
    ),
  );
}

function buildChildBranchName(name: string): string {
  return `${sanitizeFeatureBranchName(name)}-${crypto.randomUUID().slice(0, 8).toLowerCase()}`;
}

function readLinkedRepositories(
  value: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<LinkedRepositoryBootstrapResult> {
  return (value ?? []).filter(
    (entry): entry is LinkedRepositoryBootstrapResult =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

export const resolveLinkedRepositoryWorktree = (input: {
  readonly services: T3workStartChildLinkedRepositoryServices;
  readonly projectWorkspaceRoot: string;
  readonly repoFullName: string;
  readonly sessionName: string;
}) =>
  Effect.gen(function* () {
    const manifestPath = input.services.path.join(
      input.projectWorkspaceRoot,
      HIDDEN_T3WORK_DIR,
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

    const provider = yield* input.services.sourceControlProviders
      .resolve({ cwd: repositoryPath })
      .pipe(Effect.orElseSucceed(() => null));
    const baseBranch = provider
      ? yield* provider
          .getDefaultBranch({ cwd: repositoryPath })
          .pipe(Effect.orElseSucceed(() => "main"))
      : "main";

    const worktree = yield* input.services.gitWorkflow.createWorktree({
      cwd: repositoryPath,
      refName:
        typeof baseBranch === "string" && baseBranch.trim().length > 0 ? baseBranch.trim() : "main",
      newRefName: buildChildBranchName(input.sessionName),
      path: null,
    });

    return {
      repoFullName: input.repoFullName,
      branch: worktree.worktree.refName,
      worktreePath: worktree.worktree.path,
    };
  });

export const startProjectSetupScript = (input: {
  readonly services: Pick<T3workStartChildServices, "projectSetupScriptRunner">;
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
