/**
 * Finds the project's machine. Its own repository's definition is the project's machine; linked
 * repositories are scanned and reported but never used (`t3team-projectMachineOwnership`). Local checkouts are
 * authoritative; repositories without a checkout use a cached, immutable default-branch scan
 * behind CLOUD_PROJECT_MACHINE. Remote availability failures never reject a definition.
 * Standby callers request cached remote results only, so the background loop cannot fetch.
 *
 * @module t3team-ProjectMachineDiscovery
 */
import {
  type ProjectId,
  type ProjectMachineDiscovery as Discovery,
  ProjectMachineDiscoveryError,
  type ProjectMachineSourceSetting,
} from "@t3tools/contracts";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Context from "effect/Context";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectService } from "./ProjectService.ts";
import { setProjectMachineSource } from "./t3team-projectMachineSourceSet.ts";
import { scanLocation } from "./t3team-projectMachineLocationScan.ts";
import type { ScannedMachine } from "./t3team-machineDefinitionScan.ts";
import { machineRepositories } from "./t3team-projectMachineRepositories.ts";
import { logMachineSelection } from "./t3team-projectMachineLog.ts";
import { OWN_REPOSITORY, selectProjectMachine } from "./t3team-projectMachineOwnership.ts";
import {
  defaultReadout,
  isCustomSource,
  scanSelectedSource,
} from "./t3team-projectMachineSourceScan.ts";
import { readMachineSource } from "./t3team-projectMachineSourceSetting.ts";
import { makeRemoteMachineCache } from "./t3team-remoteMachineCache.ts";
import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import { readFeatureFlagFromConfig } from "../t3team-featureFlagConfig.ts";

export interface ProjectMachineSource {
  /** Local checkout root, or the workspace used for remote git requests. */
  readonly root: string;
  readonly remote?: { readonly url: string; readonly commit: string };
  readonly machine: ScannedMachine;
}

export class ProjectMachineDiscovery extends Context.Service<
  ProjectMachineDiscovery,
  {
    readonly discover: (
      projectId: ProjectId,
    ) => Effect.Effect<Discovery, ProjectMachineDiscoveryError>;
    /** Saves (or, with null, resets) where the project's machine definition is read from. */
    readonly setSource: (
      projectId: ProjectId,
      source: ProjectMachineSourceSetting | null,
    ) => Effect.Effect<Discovery, ProjectMachineDiscoveryError>;
    /** Like `discover`, plus where the default definition lives (null when there is none). */
    readonly resolveDefault: (
      projectId: ProjectId,
      options?: { readonly remote: "cached-only" },
    ) => Effect.Effect<
      {
        readonly discovery: Discovery;
        /** The project's own machine, or null: linked repositories' machines are never used. */
        readonly source: ProjectMachineSource | null;
        /** Linked repositories whose definitions were found and deliberately not used. */
        readonly ignoredRepositories: ReadonlyArray<string>;
        /** Checkouts that were scanned, own repository first. Empty when the project has none. */
        readonly checkouts: ReadonlyArray<{ readonly repository: string; readonly root: string }>;
        /** The project's title, so a session without a checkout can name its workspace after it. */
        readonly title: string;
        /** Set when the user's chosen source cannot supply a machine: a plain session must not stand in. */
        readonly sourceFailure?: string | undefined;
      },
      ProjectMachineDiscoveryError
    >;
  }
>()("t3/project/t3team-ProjectMachineDiscovery/ProjectMachineDiscovery") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectService;

  const providers = yield* PullRequestProviderRegistry;
  const vcs = yield* VcsProcess;
  const config = yield* ConfigProvider.ConfigProvider;
  const scanRemote = yield* makeRemoteMachineCache;

  const resolveDefault: ProjectMachineDiscovery["Service"]["resolveDefault"] = (
    projectId,
    options,
  ) =>
    Effect.gen(function* () {
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
      const remoteEnabled = yield* readFeatureFlagFromConfig("CLOUD_PROJECT_MACHINE");
      const own = repositories.find((location) => location.repository === OWN_REPOSITORY);
      const choice = yield* readMachineSource(project.value.workspaceRoot);
      const roots = repositories
        .filter((location) => location.local)
        .map(({ repository, root }) => ({ repository, root }));
      if (choice !== null && isCustomSource(choice, own)) {
        const selected = yield* scanSelectedSource({
          choice,
          own,
          cwd: project.value.workspaceRoot,
          remoteEnabled,
          cachedOnly: options?.remote === "cached-only",
          scanRemote,
        });
        const selection = selectProjectMachine({
          sources: selected.sources,
          rejected: selected.rejected,
          hints: selected.failure === undefined ? [] : [selected.failure],
        });
        return {
          discovery: { ...selection.discovery, source: selected.readout },
          source: selection.source,
          ignoredRepositories: [],
          checkouts: roots,
          title: project.value.title,
          sourceFailure: selected.failure,
        };
      }
      const scans = yield* Effect.forEach(
        repositories,
        (location) =>
          scanLocation({
            location,
            cwd: project.value.workspaceRoot,
            remoteEnabled,
            cachedOnly: options?.remote === "cached-only",
            scanRemote,
          }),
        { concurrency: 4 },
      );
      const missing = [
        ...new Set(
          scans.flatMap((scan) =>
            scan.notFoundRepository === undefined ? [] : [scan.notFoundRepository],
          ),
        ),
      ];
      const hints = [
        ...new Set(scans.flatMap((scan) => (scan.hint === undefined ? [] : [scan.hint]))),
      ];
      if (missing.length > 0)
        hints.unshift(
          `No remote machine definition was found in ${missing.join(", ")} at the default branch. Checked .nexi/machine.json, .devcontainer/devcontainer.json and .devcontainer.json; subfolder discovery needs a local checkout or a .nexi/machine.json pointer.`,
        );
      const selection = selectProjectMachine({
        sources: scans.flatMap((scan) => scan.sources),
        rejected: scans.flatMap((scan) => scan.rejected),
        hints,
      });
      yield* logMachineSelection(projectId, repositories, selection);
      const readout = defaultReadout(own, selection.source?.remote?.commit ?? null);
      return {
        discovery:
          readout === undefined ? selection.discovery : { ...selection.discovery, source: readout },
        source: selection.source,
        ignoredRepositories: selection.ignoredRepositories,
        checkouts: roots,
        title: project.value.title,
      };
    }).pipe(
      Effect.withSpan("projectMachine.resolveDefault"),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.provideService(PullRequestProviderRegistry, providers),
      Effect.provideService(VcsProcess, vcs),
      Effect.provideService(ConfigProvider.ConfigProvider, config),
    );

  const discover: ProjectMachineDiscovery["Service"]["discover"] = (projectId) =>
    resolveDefault(projectId).pipe(Effect.map((resolved) => resolved.discovery));

  const setSource: ProjectMachineDiscovery["Service"]["setSource"] = (projectId, source) =>
    setProjectMachineSource(projects, projectId, source).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.andThen(discover(projectId)),
    );

  return ProjectMachineDiscovery.of({ discover, resolveDefault, setSource });
});

export const layer = Layer.effect(ProjectMachineDiscovery, make).pipe(
  Layer.provide(SourceControlRateLimit.layer),
);
