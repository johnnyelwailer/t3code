import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { writeFileStringAtomically } from "./atomicWrite.ts";
import { toAtlassianError } from "./t3team-atlassian-http.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import {
  formatReferenceManifestJson,
  GITIGNORE_ENTRY,
  MANIFEST_FILE_NAME,
} from "./t3team-project-repository-utils.ts";
import type {
  MainRepositoryBootstrapResult,
  ReferenceManifestFile,
} from "./t3team-project-repository-utils.ts";
import { VcsProvisioningService } from "./vcs/VcsProvisioningService.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

export const ensureWorkspaceGitRepository = Effect.fn("ensureWorkspaceGitRepository")(function* (
  workspaceRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const provisioning = yield* VcsProvisioningService;
  const gitDirectory = path.join(workspaceRoot, ".git");
  const alreadyInitialized = yield* fileSystem
    .exists(gitDirectory)
    .pipe(Effect.orElseSucceed(() => false));
  if (alreadyInitialized) return false;
  yield* provisioning
    .initRepository({ cwd: workspaceRoot, kind: "git" })
    .pipe(Effect.mapError(toAtlassianError("Failed to initialize project git repository.")));
  return true;
});

export const ensureWorkspaceGitignore = Effect.fn("ensureWorkspaceGitignore")(function* (
  workspaceRoot: string,
  entries: ReadonlyArray<string> = [GITIGNORE_ENTRY],
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const exists = yield* fileSystem.exists(gitignorePath).pipe(Effect.orElseSucceed(() => false));
  const current = exists
    ? yield* fileSystem.readFileString(gitignorePath).pipe(Effect.orElseSucceed(() => ""))
    : "";
  const lines = current.split(/\r?\n/);
  if (entries.every((entry) => lines.some((line) => line.trim() === entry))) return;
  const missing = entries
    .filter((entry) => !lines.some((line) => line.trim() === entry))
    .join("\n");
  const next = `${current}${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${missing}\n`;
  yield* fileSystem
    .writeFileString(gitignorePath, next)
    .pipe(Effect.mapError(toAtlassianError("Failed to update workspace .gitignore.")));
});

/** Detects whether the workspace root is itself a git repository (a monorepo or wrapper repo)
 * and adopts it as the project main repository instead of wrapping it with reference clones
 * (GHE #42). `url` is the detected origin remote when the source-control registry can resolve
 * one; absent remotes or detection failures still adopt the repository without a url. */
export const detectMainRepository = Effect.fn("detectMainRepository")(function* (input: {
  readonly workspaceRoot: string;
  readonly sourceControlProviders?: SourceControlProviderRegistry["Service"];
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitDirectory = path.join(input.workspaceRoot, ".git");
  const isGitRepository = yield* fileSystem
    .exists(gitDirectory)
    .pipe(Effect.orElseSucceed(() => false));
  if (!isGitRepository) return undefined;
  // A repository without a commit is the wrapper T3 initialized for a managed workspace (e.g. the
  // project home a main-repository switch returns to), not a repository to adopt: there is
  // nothing to branch a child worktree from.
  if (isMainRepositoryEnabled()) {
    const head = yield* (yield* VcsProcess)
      .run({
        operation: "t3team.mainRepository.head",
        command: "git",
        args: ["rev-parse", "--verify", "--quiet", "HEAD"],
        cwd: input.workspaceRoot,
        allowNonZeroExit: true,
        // Local and normally instant; kept well under the client's 15s budget for the save.
        timeoutMs: 5_000,
      })
      .pipe(Effect.orElseSucceed(() => undefined));
    if (!head || head.exitCode !== 0) return undefined;
  }
  let url: string | undefined;
  if (input.sourceControlProviders) {
    const handle = yield* input.sourceControlProviders
      .resolveHandle({ cwd: input.workspaceRoot })
      .pipe(Effect.orElseSucceed(() => undefined));
    url = handle?.context?.remoteUrl;
  }
  const mainRepository: MainRepositoryBootstrapResult = {
    ...(url ? { url } : {}),
    localPath: input.workspaceRoot,
    status: "adopted",
  };
  return mainRepository;
});

export const writeReferenceManifest = Effect.fn("writeReferenceManifest")(function* (
  referencesRoot: string,
  manifest: ReferenceManifestFile,
) {
  const path = yield* Path.Path;
  const manifestPath = path.join(referencesRoot, MANIFEST_FILE_NAME);
  // Atomic: background syncs and readers (start_child, machine discovery) read it concurrently.
  yield* writeFileStringAtomically({
    filePath: manifestPath,
    contents: formatReferenceManifestJson(manifest),
  }).pipe(Effect.mapError(toAtlassianError("Failed to write repository reference manifest.")));
});
