/**
 * Proves a machine source the machine-setup agent wants to propose before the user is asked: the
 * repository is readable, the branch exists and a usable machine definition sits on it. It reads
 * the same way a cloud session will (`scanSelectedSource`, pinned to the branch tip), so a source
 * that passes here is one the session can use. It never saves anything: the setting lives on the
 * user's own environment, and only the user's answer applies it.
 *
 * @module t3team-MachineSourceProposal
 */
import {
  type ProjectId,
  ProjectMachineDiscoveryError,
  type ProjectMachineSourceSetting,
} from "@t3tools/contracts";
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
import { OWN_REPOSITORY } from "./t3team-projectMachineOwnership.ts";
import { machineRepositories } from "./t3team-projectMachineRepositories.ts";
import { machineRepositoryFromRemote } from "../cloud/t3team-cloudSessionMachineNames.ts";
import { scanSelectedSource } from "./t3team-projectMachineSourceScan.ts";
import { normalizeMachineSource } from "./t3team-projectMachineSourceSetting.ts";
import { makeRemoteMachineCache } from "./t3team-remoteMachineCache.ts";

/** A proposal that holds up: the normalized setting, how to show it, the commit it was read at. */
export interface VerifiedMachineSource {
  /** `repository` is the https clone URL, never carrying credentials. */
  readonly setting: ProjectMachineSourceSetting;
  /** `owner/repo`. */
  readonly repository: string;
  readonly branch: string | null;
  readonly commit: string | null;
  /** The proposed repository's host, and the project's own repository's host when it has one. */
  readonly host: string;
  readonly ownHost: string | null;
}

export class MachineSourceProposal extends Context.Service<
  MachineSourceProposal,
  {
    readonly verify: (
      projectId: ProjectId,
      proposal: ProjectMachineSourceSetting,
    ) => Effect.Effect<VerifiedMachineSource, ProjectMachineDiscoveryError>;
  }
>()("t3/project/t3team-MachineSourceProposal/MachineSourceProposal") {}

const invalid = (message: string) =>
  new ProjectMachineDiscoveryError({ reason: "invalid_source", message });

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectService;
  const providers = yield* PullRequestProviderRegistry;
  const vcs = yield* VcsProcess;
  const config = yield* ConfigProvider.ConfigProvider;
  const scanRemote = yield* makeRemoteMachineCache;

  const verify = Effect.fn("machineSourceProposal.verify")(function* (
    projectId: ProjectId,
    proposal: ProjectMachineSourceSetting,
  ) {
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
    const own = (yield* machineRepositories(project.value)).find(
      (location) => location.repository === OWN_REPOSITORY,
    );
    const normalized = normalizeMachineSource(proposal, own?.url);
    if ("error" in normalized) return yield* invalid(normalized.error);
    const { choice } = normalized;
    const selected = yield* scanSelectedSource({
      choice,
      own,
      cwd: project.value.workspaceRoot,
      remoteEnabled: yield* readFeatureFlagFromConfig("CLOUD_PROJECT_MACHINE"),
      cachedOnly: false,
      scanRemote,
    });
    if (selected.failure !== undefined) return yield* invalid(selected.failure);
    const { readout } = selected;
    if (readout === undefined || selected.sources.length === 0) {
      const where = readout === undefined ? "the repository" : readout.repository;
      return yield* invalid(
        `The machine definition in ${where} is not usable: ${selected.rejected
          .map((entry) => `${entry.path}: ${entry.reason}`)
          .join("; ")}`,
      );
    }
    return {
      setting: {
        ...(choice.url === undefined ? {} : { repository: choice.url }),
        ...(choice.branch === undefined ? {} : { branch: choice.branch }),
      },
      repository: readout.repository,
      branch: readout.branch,
      commit: readout.commit,
      host: readout.host,
      ownHost: own?.url === undefined ? null : (machineRepositoryFromRemote(own.url)?.host ?? null),
    } satisfies VerifiedMachineSource;
  });

  return MachineSourceProposal.of({
    verify: (projectId, proposal) =>
      verify(projectId, proposal).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.provideService(PullRequestProviderRegistry, providers),
        Effect.provideService(VcsProcess, vcs),
        Effect.provideService(ConfigProvider.ConfigProvider, config),
      ),
  });
});

export const layer = Layer.effect(MachineSourceProposal, make).pipe(
  Layer.provide(SourceControlRateLimit.layer),
);
