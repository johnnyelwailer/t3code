import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

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
 * minutes (measured on hive/nx-nexi run 248523362), so the list has to move at
 * roughly that granularity to feel live. It is three `gh` calls per poll at
 * most, against a host the user is already talking to.
 */
const CLOUD_SESSION_REFRESH_INTERVAL_MS = 5_000;

/** Serve a cached list briefly so switching surfaces does not refetch. */
const CLOUD_SESSION_STALE_TIME_MS = 2_000;

export function createCloudSessionAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const commandScheduler = createAtomCommandScheduler();

  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:cloud-sessions:list",
      tag: WS_METHODS.cloudSessionList,
      staleTimeMs: CLOUD_SESSION_STALE_TIME_MS,
      refreshIntervalMs: CLOUD_SESSION_REFRESH_INTERVAL_MS,
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
