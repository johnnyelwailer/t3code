/**
 * Finds a project's existing machine definitions: its own repository and its linked ones, on the
 * default branch, other branches and pull requests, so an agent setting up a machine proposes what
 * a teammate already wrote instead of asking the user for a repository and branch. Read-only, and
 * behind CLOUD_PROJECT_MACHINE like the discovery it shares its reader with.
 *
 * @module t3team-MachineDefinitionFinder
 */
import { type ProjectId, ProjectMachineDiscoveryError } from "@t3tools/contracts";
import { repositoryPathFromRemoteUrl } from "@t3tools/source-control-core/server/SourceControlProvider";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { readFeatureFlagFromConfig } from "../t3team-featureFlagConfig.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import { ProjectService } from "./ProjectService.ts";
import { searchRepository } from "./t3team-machineDefinitionSearchRepository.ts";
import type { MachineDefinitionSearchResult } from "./t3team-machineDefinitionSearchResult.ts";
import {
  machineRepositories,
  type MachineRepositoryLocation,
} from "./t3team-projectMachineRepositories.ts";

export class MachineDefinitionFinder extends Context.Service<
  MachineDefinitionFinder,
  {
    readonly find: (
      projectId: ProjectId,
    ) => Effect.Effect<MachineDefinitionSearchResult, ProjectMachineDiscoveryError>;
  }
>()("t3/project/t3team-MachineDefinitionFinder/MachineDefinitionFinder") {}

const PLAIN_REPOSITORY = /^[\w.-]+(\/[\w.-]+)+$/;
/** A name safe to show: from the URL's path, never the URL (which can carry a credential). */
const nameOf = (location: MachineRepositoryLocation) =>
  repositoryPathFromRemoteUrl(location.url ?? null) ??
  (PLAIN_REPOSITORY.test(location.repository) ? location.repository : "this project's repository");

const empty = (repository: string, reason: string): MachineDefinitionSearchResult => ({
  candidates: [],
  checked: [],
  unreadable: [{ repository, reason }],
  setupHints: [],
});

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectService;
  const providers = yield* PullRequestProviderRegistry;
  const vcs = yield* VcsProcess;
  const config = yield* ConfigProvider.ConfigProvider;
  const limits = yield* SourceControlRateLimit.SourceControlRateLimit;

  const find = Effect.fn("machineSearch.find")(function* (projectId: ProjectId) {
    const project = yield* projects.getById(projectId).pipe(
      Effect.mapError(
        () =>
          new ProjectMachineDiscoveryError({
            reason: "unreadable",
            message: "The project could not be read.",
          }),
      ),
    );
    if (Option.isNone(project)) {
      return yield* new ProjectMachineDiscoveryError({
        reason: "unknown_project",
        message: "That project does not exist on this environment.",
      });
    }
    const repositories = yield* machineRepositories(project.value);
    const enabled = yield* readFeatureFlagFromConfig("CLOUD_PROJECT_MACHINE");
    const results = yield* Effect.forEach(
      repositories,
      (location) => {
        const repository = nameOf(location);
        if (!enabled)
          return Effect.succeed(empty(repository, "Remote machine discovery is turned off"));
        if (location.url === undefined)
          return Effect.succeed(empty(repository, "This repository has no remote URL to search."));
        return searchRepository({
          repository: location.repository,
          url: location.url,
          cwd: project.value.workspaceRoot,
          provider: location.provider,
        }).pipe(
          Effect.catchTag("RemoteUnavailable", (error) =>
            Effect.succeed(empty(repository, error.reason)),
          ),
        );
      },
      { concurrency: 2 },
    );
    return {
      candidates: results.flatMap((result) => result.candidates),
      checked: results.flatMap((result) => result.checked),
      unreadable: results.flatMap((result) => result.unreadable),
      setupHints: results.flatMap((result) => result.setupHints),
    } satisfies MachineDefinitionSearchResult;
  });

  return MachineDefinitionFinder.of({
    find: (projectId) =>
      find(projectId).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.provideService(PullRequestProviderRegistry, providers),
        Effect.provideService(VcsProcess, vcs),
        Effect.provideService(ConfigProvider.ConfigProvider, config),
        Effect.provideService(SourceControlRateLimit.SourceControlRateLimit, limits),
      ),
  });
});

export const layer = Layer.effect(MachineDefinitionFinder, make).pipe(
  Layer.provide(SourceControlRateLimit.layer),
);
