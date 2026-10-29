/**
 * Scans one repository location of a project: a local checkout is authoritative, a repository
 * without one uses the cached default-branch remote scan behind CLOUD_PROJECT_MACHINE. A remote
 * that is unavailable never rejects a definition; it becomes a hint.
 *
 * @module t3team-projectMachineLocationScan
 */
import * as Effect from "effect/Effect";

import type { ProjectMachineSource } from "./t3team-ProjectMachineDiscovery.ts";
import type { MachineRepositoryLocation } from "./t3team-projectMachineRepositories.ts";
import { scanCheckout } from "./t3team-projectMachineScan.ts";
import type { makeRemoteMachineCache } from "./t3team-remoteMachineCache.ts";

const unavailable = (hint: string) =>
  Effect.succeed({ rejected: [], sources: [], notFoundRepository: undefined, hint });

export const scanLocation = (input: {
  readonly location: MachineRepositoryLocation;
  readonly cwd: string;
  readonly remoteEnabled: boolean;
  readonly cachedOnly: boolean;
  readonly scanRemote: Effect.Success<typeof makeRemoteMachineCache>;
}) =>
  Effect.gen(function* () {
    const { location } = input;
    if (location.local) {
      const scan = yield* scanCheckout(location);
      return {
        rejected: scan.rejected,
        sources: scan.candidates.map((machine): ProjectMachineSource => ({
          root: location.root,
          machine,
        })),
        notFoundRepository: undefined,
        hint: undefined,
      };
    }
    const scan =
      location.url === undefined || !input.remoteEnabled
        ? null
        : yield* input.scanRemote(
            {
              repository: location.repository,
              url: location.url,
              cwd: input.cwd,
              provider: location.provider,
            },
            input.cachedOnly,
          );
    return {
      rejected: scan?.rejected ?? [],
      sources:
        scan?.candidates.map((machine): ProjectMachineSource => ({
          root: input.cwd,
          machine,
          remote: scan.remote,
        })) ?? [],
      notFoundRepository: scan?.notFoundRepository,
      hint: undefined,
    };
  }).pipe(
    Effect.catchTags({
      RemoteUnavailable: (error) => unavailable(error.reason),
      // Only a chosen branch raises these; the default scan reads the default branch.
      RepositoryRefused: (error) => unavailable(error.reason),
      BranchNotFound: (error) => unavailable(`Branch ${error.branch} was not found.`),
    }),
  );
