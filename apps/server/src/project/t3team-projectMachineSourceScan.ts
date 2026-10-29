/**
 * Scans the repository and branch the user chose as a project's machine source. The scan is the
 * default one (cached, pinned to the branch tip's commit) pointed at another place; its failures
 * are the user's to fix, so they are named instead of becoming "this project has no machine".
 *
 * @module t3team-projectMachineSourceScan
 */
import type { ProjectMachineSourceReadout } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { machineRepositoryFromRemote } from "../cloud/t3team-cloudSessionMachineNames.ts";
import type { ProjectMachineSource } from "./t3team-ProjectMachineDiscovery.ts";
import type { makeRemoteMachineCache } from "./t3team-remoteMachineCache.ts";
import type { MachineRepositoryLocation } from "./t3team-projectMachineRepositories.ts";
import type { MachineSourceChoice } from "./t3team-projectMachineSourceSetting.ts";
import { OWN_REPOSITORY } from "./t3team-projectMachineOwnership.ts";

type ScanRemote = Effect.Success<typeof makeRemoteMachineCache>;

const CHECKED = ".nexi/machine.json, .devcontainer/devcontainer.json and .devcontainer.json";

/** The user chose a source that is not the project's default; the default scan stays as it was. */
export function isCustomSource(
  choice: MachineSourceChoice,
  own: MachineRepositoryLocation | undefined,
) {
  const ownUrl = own?.url === undefined ? null : machineRepositoryFromRemote(own.url)?.url;
  return choice.branch !== undefined || (choice.url !== undefined && choice.url !== ownUrl);
}

/** The default source (no saved choice), for the session setup to show where the machine came from. */
export function defaultReadout(
  own: MachineRepositoryLocation | undefined,
  commit: string | null,
): ProjectMachineSourceReadout | undefined {
  const repository = own?.url === undefined ? null : machineRepositoryFromRemote(own.url);
  return repository === null
    ? undefined
    : {
        repository: `${repository.owner}/${repository.name}`,
        host: repository.host,
        branch: null,
        commit,
        override: null,
      };
}

export const scanSelectedSource = Effect.fn("projectMachine.scanSelectedSource")(function* (input: {
  readonly choice: MachineSourceChoice;
  readonly own: MachineRepositoryLocation | undefined;
  readonly cwd: string;
  readonly remoteEnabled: boolean;
  readonly cachedOnly: boolean;
  readonly scanRemote: ScanRemote;
}) {
  const url = input.choice.url ?? input.own?.url;
  const repository = url === undefined ? null : machineRepositoryFromRemote(url);
  const none = {
    rejected: [],
    sources: [] as ReadonlyArray<ProjectMachineSource>,
    readout: undefined as ProjectMachineSourceReadout | undefined,
  };
  if (url === undefined || repository === null) {
    return {
      ...none,
      failure: "This project has no https repository to read a machine definition from.",
    };
  }
  const label = `${repository.owner}/${repository.name}`;
  const where =
    input.choice.branch === undefined ? "its default branch" : `branch ${input.choice.branch}`;
  const override = {
    ...(input.choice.url === undefined ? {} : { repository: input.choice.url }),
    ...(input.choice.branch === undefined ? {} : { branch: input.choice.branch }),
  };
  const readout = (commit: string | null): ProjectMachineSourceReadout => ({
    repository: label,
    host: repository.host,
    branch: input.choice.branch ?? null,
    commit,
    override,
  });
  if (!input.remoteEnabled) {
    return {
      ...none,
      readout: readout(null),
      failure: "Remote machine discovery is turned off on this environment.",
    };
  }
  const scan = yield* input
    .scanRemote(
      {
        repository: OWN_REPOSITORY,
        url: repository.url,
        cwd: input.cwd,
        provider: input.choice.url === undefined ? input.own?.provider : undefined,
        branch: input.choice.branch,
      },
      input.cachedOnly,
    )
    .pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catchTags({
        RepositoryRefused: () =>
          Effect.succeed({
            ok: false as const,
            failure: `Repository ${label} was not found, or your sign-in cannot read it.`,
          }),
        BranchNotFound: (error) =>
          Effect.succeed({
            ok: false as const,
            failure: `Branch ${error.branch} was not found in ${label}.`,
          }),
        RemoteUnavailable: (error) =>
          Effect.succeed({
            ok: false as const,
            failure: `${label} could not be read: ${error.reason}`,
          }),
      }),
    );
  if (!scan.ok) return { ...none, readout: readout(null), failure: scan.failure };
  if (scan.value === null) return { ...none, readout: readout(null), failure: undefined };
  const { value } = scan;
  const found = value.candidates.length > 0 || value.rejected.length > 0;
  return {
    rejected: value.rejected,
    sources: value.candidates.map((machine): ProjectMachineSource => ({
      root: input.cwd,
      machine,
      remote: value.remote,
    })),
    readout: readout(value.remote.commit),
    failure: found
      ? undefined
      : `No machine definition was found in ${label} on ${where}. Checked ${CHECKED}.`,
  };
});
