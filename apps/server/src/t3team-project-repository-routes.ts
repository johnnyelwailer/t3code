import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
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
  detectMetaRepository,
  syncLinkedRepository,
  writeReferenceManifest,
} from "./t3team-project-repository-services.ts";
import {
  deriveReferenceDirectoryName,
  HIDDEN_T3TEAM_DIR,
  META_REPOSITORY_GITIGNORE_ENTRIES,
  MANIFEST_FILE_NAME,
  normalizeT3TeamWorkspaceRoot,
  normalizeRepositoryUrls,
  REFERENCES_DIR_NAME,
  toT3TeamError,
} from "./t3team-project-repository-utils.ts";
import {
  type BootstrapWorkspaceRequest,
  type BootstrapWorkspaceResponse,
  type LinkedRepositoryBootstrapResult,
  type MetaRepositoryBootstrapResult,
  type ReferenceManifestFile,
} from "./t3team-project-repository-utils.ts";
import { repositoryLookupCandidates } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";

/** Tolerant read of the `linkedRepositories` array from a persisted reference manifest, used
 * to preserve entries when re-bootstrapping an adopted meta-repo (GHE #42). */
const ReferenceManifestLinkedRepositoriesJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeReferenceManifestLinkedRepositories = Schema.decodeEffect(
  Schema.fromJsonString(ReferenceManifestLinkedRepositoriesJson),
);

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
    // project meta-repo instead of being wrapped with reference clones (GHE #42): sub-work
    // happens in worktrees of the meta-repo itself, and only the machine-local `.t3team/`
    // subpaths stay gitignored so committed team state can live in the repository.
    const metaRepository: MetaRepositoryBootstrapResult | undefined = workspaceRepositoryInitialized
      ? undefined
      : yield* detectMetaRepository({
          workspaceRoot,
          ...(EffectOption.isSome(sourceControlProvidersOption)
            ? { sourceControlProviders: sourceControlProvidersOption.value }
            : {}),
        });
    yield* ensureWorkspaceGitignore(
      workspaceRoot,
      metaRepository ? META_REPOSITORY_GITIGNORE_ENTRIES : undefined,
    );

    const referencesRoot = path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    yield* fileSystem
      .makeDirectory(referencesRoot, { recursive: true })
      .pipe(Effect.mapError(toAtlassianError("Failed to create repository references directory.")));

    // Auto-detection (GHE #42 item 2): a linked URL matching the meta-repo's own remote is the
    // meta-repo itself, not a reference clone — skip wrapping it.
    const metaRepositoryLookupCandidates = metaRepository?.url
      ? [...repositoryLookupCandidates(metaRepository.url)]
      : undefined;
    const linkedRepositoryUrls = normalizeRepositoryUrls(input.linkedRepositoryUrls).filter(
      (url) =>
        !metaRepositoryLookupCandidates?.some((candidate) =>
          repositoryLookupCandidates(url).includes(candidate),
        ),
    );
    const linkedRepositories: LinkedRepositoryBootstrapResult[] = [];
    for (const [index, url] of linkedRepositoryUrls.entries()) {
      const result = yield* syncLinkedRepository({
        workspaceRoot,
        referencesRoot,
        url,
        index,
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            url,
            localPath: path.join(
              referencesRoot,
              `${String(index + 1).padStart(2, "0")}-${deriveReferenceDirectoryName(url)}`,
            ),
            status: "failed",
            error:
              error instanceof T3TeamAtlassianError
                ? error.message
                : "Failed to sync linked repository reference.",
          } satisfies LinkedRepositoryBootstrapResult),
        ),
      );
      linkedRepositories.push(result);
    }

    const response: BootstrapWorkspaceResponse = {
      workspaceRoot,
      workspaceRepositoryInitialized,
      referencesRoot,
      linkedRepositories,
      ...(metaRepository ? { metaRepository } : {}),
    };
    const manifest: ReferenceManifestFile = {
      ...response,
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    };

    // An adopted meta-repo may already carry a reference manifest from an earlier
    // bootstrap (linked repositories registered after adoption): preserve those entries so
    // re-bootstrapping never drops them.
    const preservedManifestPath = path.join(referencesRoot, MANIFEST_FILE_NAME);
    const preservedManifestExists = yield* fileSystem
      .exists(preservedManifestPath)
      .pipe(Effect.orElseSucceed(() => false));
    let nextManifest = manifest;
    if (preservedManifestExists) {
      const preservedRaw = yield* fileSystem
        .readFileString(preservedManifestPath)
        .pipe(Effect.orElseSucceed(() => ""));
      const preserved = yield* decodeReferenceManifestLinkedRepositories(preservedRaw).pipe(
        Effect.orElseSucceed(() => ({ linkedRepositories: [] })),
      );
      const preservedEntries = (preserved.linkedRepositories ??
        []) as ReadonlyArray<LinkedRepositoryBootstrapResult>;
      if (preservedEntries.length > 0) {
        nextManifest = {
          ...manifest,
          linkedRepositories: [...preservedEntries, ...linkedRepositories],
        };
      }
    }

    yield* writeReferenceManifest(referencesRoot, nextManifest);
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to bootstrap project workspace.")),
    Effect.catch(errorResponse),
  ),
);
