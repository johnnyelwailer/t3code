import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import { toAtlassianError } from "./t3work-atlassian-http.ts";
import {
  deriveReferenceDirectoryName,
  formatReferenceManifestJson,
  GITIGNORE_ENTRY,
  MANIFEST_FILE_NAME,
} from "./t3work-project-repository-utils.ts";
import type {
  LinkedRepositoryBootstrapResult,
  ReferenceManifestFile,
} from "./t3work-project-repository-utils.ts";
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
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const exists = yield* fileSystem.exists(gitignorePath).pipe(Effect.orElseSucceed(() => false));
  const current = exists
    ? yield* fileSystem.readFileString(gitignorePath).pipe(Effect.orElseSucceed(() => ""))
    : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === GITIGNORE_ENTRY)) return;
  const next = `${current}${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${GITIGNORE_ENTRY}\n`;
  yield* fileSystem
    .writeFileString(gitignorePath, next)
    .pipe(Effect.mapError(toAtlassianError("Failed to update workspace .gitignore.")));
});

export const syncLinkedRepository = Effect.fn("syncLinkedRepository")(function* (input: {
  readonly workspaceRoot: string;
  readonly referencesRoot: string;
  readonly url: string;
  readonly index: number;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceControl = yield* SourceControlRepositoryService;
  const vcsProcess = yield* VcsProcess;
  const baseName = deriveReferenceDirectoryName(input.url);
  const localDirectory = path.join(
    input.referencesRoot,
    `${String(input.index + 1).padStart(2, "0")}-${baseName}`,
  );
  const localGitDirectory = path.join(localDirectory, ".git");
  const alreadyCloned = yield* fileSystem
    .exists(localGitDirectory)
    .pipe(Effect.orElseSucceed(() => false));

  if (alreadyCloned) {
    yield* vcsProcess
      .run({
        operation: "t3work.referenceRepository.fetch",
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
