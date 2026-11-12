import { type EnvironmentId, type ServerConfig, WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

/**
 * Settings → Features: the registry view of every feature flag and the per-user override.
 * The view re-reads whenever the server streams new effective values (`featureFlagsUpdated`),
 * so a change from another client or an env-driven restart shows up without a reload.
 */
export function createFeatureFlagAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly configValueAtom: (environmentId: EnvironmentId) => Atom.Atom<ServerConfig | null>;
  },
) {
  const featureFlagValuesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => get(options.configValueAtom(environmentId))?.featureFlags ?? null).pipe(
      Atom.withLabel(`environment-data:server:feature-flag-values:${environmentId}`),
    ),
  );

  return {
    featureFlags: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:feature-flags",
      tag: WS_METHODS.serverGetFeatureFlags,
      refreshTrigger: ({ environmentId }) => featureFlagValuesAtom(environmentId),
    }),
    setFeatureFlag: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:set-feature-flag",
      tag: WS_METHODS.serverSetFeatureFlag,
      concurrency: {
        mode: "serial",
        key: ({ environmentId }) => environmentId,
      },
    }),
  };
}
