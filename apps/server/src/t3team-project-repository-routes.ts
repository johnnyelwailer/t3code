import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as EffectOption from "effect/Option";
import { HttpRouter } from "effect/unstable/http";
import {
  readPersistedT3TeamProjectSetupState,
  renderT3TeamProjectSetupFiles,
  resolveT3TeamProjectSetupProfileId,
  resolveT3TeamProjectSetupWriteDecision,
  T3TEAM_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3team-projectSetup.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
  toAtlassianError,
} from "./t3team-atlassian-http.ts";
import {
  ensureWorkspaceGitRepository,
  ensureWorkspaceGitignore,
  detectMainRepository,
} from "./t3team-project-repository-services.ts";
import {
  MAIN_REPOSITORY_GITIGNORE_ENTRIES,
  normalizeT3TeamWorkspaceRoot,
  toT3TeamError,
  type BootstrapWorkspaceRequest,
  type MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";

export const t3teamProjectWorkspaceBootstrapRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/bootstrap",
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceControlProvidersOption = yield* Effect.serviceOption(SourceControlProviderRegistry);
    const input = yield* readJsonBody<BootstrapWorkspaceRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0)
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot is required." });
    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);

    yield* fileSystem
      .makeDirectory(workspaceRoot, { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to ensure workspace directory exists.")));

    const persistedProfilePath = path.join(workspaceRoot, T3TEAM_PROJECT_PROFILE_MANIFEST_PATH);
    const persistedProfileExists = yield* fileSystem
      .exists(persistedProfilePath)
      .pipe(Effect.orElseSucceed(() => false));
    const persistedSetupState = persistedProfileExists
      ? readPersistedT3TeamProjectSetupState(
          yield* fileSystem
            .readFileString(persistedProfilePath)
            .pipe(Effect.orElseSucceed(() => "")),
        )
      : { managedFileHashes: {} };
    const setupProfileId = resolveT3TeamProjectSetupProfileId(
      input.customProfile?.id ?? input.setupProfileId ?? persistedSetupState.profileId,
    );
    const previewSetupFiles = renderT3TeamProjectSetupFiles({
      profileId: setupProfileId,
      ...(input.customProfile ? { customProfile: input.customProfile } : {}),
    });
    const writeDecisions = new Map<
      string,
      ReturnType<typeof resolveT3TeamProjectSetupWriteDecision>
    >();
    const nextManagedFileHashes: Record<string, string> = {
      ...persistedSetupState.managedFileHashes,
    };

    for (const file of previewSetupFiles) {
      if (!file.managedRefresh) {
        continue;
      }

      const targetPath = path.join(workspaceRoot, file.relativePath);
      const exists = yield* fileSystem.exists(targetPath).pipe(Effect.orElseSucceed(() => false));
      const currentContents = exists
        ? yield* fileSystem
            .readFileString(targetPath)
            .pipe(Effect.mapError(toAtlassianError("Failed to read workspace setup file.")))
        : undefined;
      const persistedManagedHash = persistedSetupState.managedFileHashes[file.relativePath];
      const decision = resolveT3TeamProjectSetupWriteDecision({
        file,
        ...(typeof currentContents === "string" ? { currentContents } : {}),
        ...(typeof persistedManagedHash === "string" ? { persistedManagedHash } : {}),
      });
      writeDecisions.set(file.relativePath, decision);
      if (decision.nextManagedHash) {
        nextManagedFileHashes[file.relativePath] = decision.nextManagedHash;
      }
    }

    const setupFiles = renderT3TeamProjectSetupFiles({
      profileId: setupProfileId,
      managedFileHashes: nextManagedFileHashes,
      ...(input.customProfile ? { customProfile: input.customProfile } : {}),
    });
    for (const file of setupFiles) {
      const targetPath = path.join(workspaceRoot, file.relativePath);
      const exists = yield* fileSystem.exists(targetPath).pipe(Effect.orElseSucceed(() => false));
      if (exists) {
        if (file.writeMode === "overwrite") {
          // Always rewrite the manifest so stored scaffold hashes stay current.
        } else if (!writeDecisions.get(file.relativePath)?.shouldWrite) {
          continue;
        }
      }
      yield* fileSystem
        .makeDirectory(path.dirname(targetPath), { recursive: true })
        .pipe(Effect.mapError(toAtlassianError("Failed to create workspace setup directory.")));
      yield* fileSystem
        .writeFileString(targetPath, file.contents)
        .pipe(Effect.mapError(toAtlassianError("Failed to write workspace setup file.")));
    }

    const workspaceRepositoryInitialized = yield* ensureWorkspaceGitRepository(workspaceRoot);
    // A workspace that is ALREADY a git repository (monorepo, wrapper repo) is adopted as the
    // project main repository instead of being wrapped with reference clones (GHE #42): sub-work
    // happens in worktrees of the main repository itself, and only the machine-local `.t3team/`
    // subpaths stay gitignored so committed team state can live in the repository.
    const mainRepository: MainRepositoryBootstrapResult | undefined = workspaceRepositoryInitialized
      ? undefined
      : yield* detectMainRepository({
          workspaceRoot,
          ...(EffectOption.isSome(sourceControlProvidersOption)
            ? { sourceControlProviders: sourceControlProvidersOption.value }
            : {}),
        });
    yield* ensureWorkspaceGitignore(
      workspaceRoot,
      mainRepository ? MAIN_REPOSITORY_GITIGNORE_ENTRIES : undefined,
    );

    const response = yield* bootstrapWorkspaceReferences({
      workspaceRoot,
      workspaceRepositoryInitialized,
      detectedMainRepository: mainRepository,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
    });
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to bootstrap project workspace.")),
    Effect.catch(errorResponse),
  ),
);
