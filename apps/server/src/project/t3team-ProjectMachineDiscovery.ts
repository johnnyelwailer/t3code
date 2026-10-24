import {
  type ProjectId,
  type ProjectMachineDiscovery as Discovery,
  ProjectMachineDiscoveryError,
  PROJECT_MACHINE_FILE_PATH,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectService } from "./ProjectService.ts";
import { scanCheckout } from "./t3team-projectMachineScan.ts";
import type { ScannedMachine } from "./t3team-machineDefinitionScan.ts";
import { machineRepositories } from "./t3team-projectMachineRepositories.ts";
import { scanRemote } from "./t3team-remoteMachineScan.ts";
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
    /** Like `discover`, plus where the default definition lives (null when there is none). */
    readonly resolveDefault: (projectId: ProjectId) => Effect.Effect<
      {
        readonly discovery: Discovery;
        readonly source: ProjectMachineSource | null;
        /** Checkouts that were scanned, own repository first. Empty when the project has none. */
        readonly checkouts: ReadonlyArray<{ readonly repository: string; readonly root: string }>;
        /** The project's title, so a session without a checkout can name its workspace after it. */
        readonly title: string;
      },
      ProjectMachineDiscoveryError
    >;
  }
>()("t3/project/t3team-ProjectMachineDiscovery/ProjectMachineDiscovery") {}

/** Pointer-backed definitions first: a committed `.nexi/machine.json` is a stated choice. */
const byIntent = <A extends { readonly machineFilePath: string | null }>(a: A, b: A) =>
  Number(a.machineFilePath === null) - Number(b.machineFilePath === null);

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectService;

  const providers = yield* PullRequestProviderRegistry;
  const vcs = yield* VcsProcess;
  const config = yield* ConfigProvider.ConfigProvider;

  const resolveDefault: ProjectMachineDiscovery["Service"]["resolveDefault"] = (projectId) =>
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
      const roots = repositories
        .filter((location) => location.local)
        .map(({ repository, root }) => ({ repository, root }));
      const scans = yield* Effect.forEach(
        repositories,
        (location) =>
          Effect.gen(function* () {
            if (location.local) {
              const scan = yield* scanCheckout(location);
              return {
                rejected: scan.rejected,
                sources: scan.candidates.map((machine): ProjectMachineSource => ({
                  root: location.root,
                  machine,
                })),
                notFoundReason: undefined,
              };
            }
            const scan =
              location.url === undefined || !remoteEnabled
                ? null
                : yield* scanRemote({
                    repository: location.repository,
                    url: location.url,
                    cwd: project.value.workspaceRoot,
                    provider: location.provider,
                  });
            return {
              rejected: scan?.rejected ?? [],
              sources:
                scan?.candidates.map((machine): ProjectMachineSource => ({
                  root: project.value.workspaceRoot,
                  machine,
                  remote: scan.remote,
                })) ?? [],
              notFoundReason: scan?.notFoundReason,
            };
          }).pipe(
            Effect.catchTags({
              ProjectMachineDiscoveryError: (error) =>
                Effect.succeed({
                  rejected: [
                    {
                      repository: location.repository,
                      path: PROJECT_MACHINE_FILE_PATH,
                      reason: error.message,
                    },
                  ],
                  sources: [],
                  notFoundReason: undefined,
                }),
            }),
          ),
        { concurrency: 4 },
      );
      const sources = scans
        .flatMap((scan) => scan.sources)
        .toSorted((a, b) => byIntent(a.machine, b.machine));
      const candidates = sources.map(({ machine: { files: _files, ...definition } }) => definition);
      const first = candidates[0];
      return {
        discovery: {
          status:
            first === undefined
              ? {
                  _tag: "None",
                  ...(scans.some((scan) => scan.notFoundReason !== undefined)
                    ? {
                        reason: scans
                          .flatMap((scan) =>
                            scan.notFoundReason === undefined ? [] : [scan.notFoundReason],
                          )
                          .join(" "),
                      }
                    : {}),
                }
              : { _tag: "Detected", definition: first },
          candidates,
          rejected: scans.flatMap((scan) => scan.rejected),
        } satisfies Discovery,
        source: sources[0] ?? null,
        checkouts: roots,
        title: project.value.title,
      };
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
      Effect.provideService(PullRequestProviderRegistry, providers),
      Effect.provideService(VcsProcess, vcs),
      Effect.provideService(ConfigProvider.ConfigProvider, config),
    );

  const discover: ProjectMachineDiscovery["Service"]["discover"] = (projectId) =>
    resolveDefault(projectId).pipe(Effect.map((resolved) => resolved.discovery));

  return ProjectMachineDiscovery.of({ discover, resolveDefault });
});

export const layer = Layer.effect(ProjectMachineDiscovery, make);
