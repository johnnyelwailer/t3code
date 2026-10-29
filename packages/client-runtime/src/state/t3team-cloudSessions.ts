import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

/**
 * Cloud sessions — Nexi workspaces provisioned on remote compute, which join
 * the environment list once their relay link is up.
 *
 * Lives in client-runtime rather than the web app so mobile gets the same
 * surface for free: starting a machine from a phone is the case this whole
 * feature exists to make possible.
 */

/**
 * A provisioning session changes phase every few seconds for its first ~2.5
 * minutes (measured on hive/nx-nexi run 248523362). Ten seconds is still live
 * to the eye, and each list costs two GHE calls (runs + the moving run's steps),
 * so the busy cadence is deliberately well above the 5s server-side steps cache
 * and the 5s client refresh floor. List polls go through `GitHubApi` as
 * background reads (no quota reserve, honour the rate-limit pause).
 *
 * The interval is driven by the UI surface that is actually looking at the
 * list (the "Run on" menu while it is open), not by this atom: the list itself
 * carries no refresh interval, so an idle app spends no GHE calls on it.
 */
export const CLOUD_SESSION_REFRESH_INTERVAL_MS = 10_000;

/** Serve a cached list briefly so switching surfaces does not refetch. */
const CLOUD_SESSION_STALE_TIME_MS = 2_000;

/** Discovery reads files on disk; serve the last answer for this long before re-reading. */
const PROJECT_MACHINE_STALE_TIME_MS = 30_000;

export function createCloudSessionAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const commandScheduler = createAtomCommandScheduler();

  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:cloud-sessions:list",
      tag: WS_METHODS.cloudSessionList,
      // No `refreshIntervalMs`: the list only re-polls while a surface is
      // actively showing it (see `CLOUD_SESSION_REFRESH_INTERVAL_MS`). Mounting
      // the atom still revalidates a stale value once, which is how the
      // settings panel and the "Run on" menu each pick up current phases.
      staleTimeMs: CLOUD_SESSION_STALE_TIME_MS,
    }),

    /**
     * Serialised per environment: creating spends real compute, so a
     * double-click must not provision two machines.
     */
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:cloud-sessions:create",
      tag: WS_METHODS.cloudSessionCreate,
      scheduler: commandScheduler,
      concurrency: {
        mode: "serial" as const,
        key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
      },
    }),

    /**
     * The machine a new cloud session from this project builds (its default template), read from
     * the project's checkouts on the environment that holds it. A committed definition changes
     * rarely; remounting the surface that shows it revalidates.
     */
    projectMachine: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:cloud-sessions:project-machine",
      tag: WS_METHODS.projectMachineDiscover,
      staleTimeMs: PROJECT_MACHINE_STALE_TIME_MS,
    }),

    /** Saves where a project's machine definition is read from; null resets it. One at a time per project. */
    setProjectMachineSource: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:cloud-sessions:set-project-machine-source",
      tag: WS_METHODS.projectMachineSetSource,
      scheduler: commandScheduler,
      concurrency: {
        mode: "serial" as const,
        key: ({
          environmentId,
          input,
        }: {
          readonly environmentId: string;
          readonly input: { readonly projectId: string };
        }) => JSON.stringify([environmentId, input.projectId]),
      },
    }),

    cancel: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:cloud-sessions:cancel",
      tag: WS_METHODS.cloudSessionCancel,
      scheduler: commandScheduler,
      concurrency: {
        mode: "serial" as const,
        key: ({
          environmentId,
          input,
        }: {
          readonly environmentId: string;
          readonly input: { readonly sessionId: string };
        }) => JSON.stringify([environmentId, input.sessionId]),
      },
    }),
  };
}
