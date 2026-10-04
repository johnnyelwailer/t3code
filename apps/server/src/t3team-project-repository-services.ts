import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { toAtlassianError } from "./t3team-atlassian-http.ts";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import {
  deriveReferenceDirectoryName,
  formatReferenceManifestJson,
  GITIGNORE_ENTRY,
  MANIFEST_FILE_NAME,
} from "./t3team-project-repository-utils.ts";
import type {
  LinkedRepositoryBootstrapResult,
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
        timeoutMs: 15_000,
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

export const syncLinkedRepository = Effect.fn("syncLinkedRepository")(function* (input: {
  readonly workspaceRoot: string;
  readonly referencesRoot: string;
  readonly url: string;
  readonly index: number;
  /** A clone recorded by an earlier bootstrap (possibly under another workspace's state dir,
   * after a main-repository switch); reused instead of cloning again. */
  readonly existingLocalPath?: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceControl = yield* SourceControlRepositoryService;
  const vcsProcess = yield* VcsProcess;
  const baseName = deriveReferenceDirectoryName(input.url);
  const existingIsClone = input.existingLocalPath
    ? yield* fileSystem
        .exists(path.join(input.existingLocalPath, ".git"))
        .pipe(Effect.orElseSucceed(() => false))
    : false;
  const localDirectory =
    existingIsClone && input.existingLocalPath
      ? input.existingLocalPath
      : path.join(input.referencesRoot, `${String(input.index + 1).padStart(2, "0")}-${baseName}`);
  const localGitDirectory = path.join(localDirectory, ".git");
  const alreadyCloned = yield* fileSystem
    .exists(localGitDirectory)
    .pipe(Effect.orElseSucceed(() => false));

  if (alreadyCloned) {
    yield* vcsProcess
      .run({
        operation: "t3team.referenceRepository.fetch",
        command: "git",
        args: ["-C", localDirectory, "fetch", "--all", "--prune"],
        cwd: input.workspaceRoot,
        timeoutMs: 120_000,
      })
      .pipe(Effect.mapError(toAtlassianError("Failed to update linked repository reference.")));
    return {
      url: input.url,
      localPath: localDirectory,
      status: "updated",
    } satisfies LinkedRepositoryBootstrapResult;
  }

  const targetExists = yield* fileSystem
    .exists(localDirectory)
    .pipe(Effect.orElseSucceed(() => false));
  if (targetExists) {
    return {
      url: input.url,
      localPath: localDirectory,
      status: "failed",
      error: "Reference path already exists but is not a git repository.",
    } satisfies LinkedRepositoryBootstrapResult;
  }

  yield* sourceControl
    .cloneRepository({ remoteUrl: input.url, destinationPath: localDirectory, protocol: "auto" })
    .pipe(Effect.mapError(toAtlassianError("Failed to clone linked repository reference.")));
  return {
    url: input.url,
    localPath: localDirectory,
    status: "cloned",
  } satisfies LinkedRepositoryBootstrapResult;
});

export const writeReferenceManifest = Effect.fn("writeReferenceManifest")(function* (
  referencesRoot: string,
  manifest: ReferenceManifestFile,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(referencesRoot, MANIFEST_FILE_NAME);
  yield* fileSystem
    .writeFileString(manifestPath, formatReferenceManifestJson(manifest))
    .pipe(Effect.mapError(toAtlassianError("Failed to write repository reference manifest.")));
});
