/**
 * Pack-registered feature flags (`defineFeatureFlags`). The compiled-in distribution registers
 * during its activation; runtime packs register through `loadPackFeatureFlags` at boot. Both land
 * in the one registry Settings → Features and `T3TEAM_PACK_FLAGS` are built from.
 */
import { activateWorkspacePack, type PackFeatureFlagRegistration } from "@t3team/packs";
import {
  FEATURE_FLAG_GROUPS,
  registerPackFeatureFlags,
  type FeatureFlagGroup,
} from "@t3tools/project-context/t3teamFeatureFlags";

import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

const PACK_FLAG_KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;

function isFeatureFlagGroup(group: string): group is FeatureFlagGroup {
  return FEATURE_FLAG_GROUPS.some((known) => known === group);
}

/** Rejects a malformed definition at activation, so a pack cannot list a flag the page cannot place. */
export function registerPackFeatureFlagDefinitions(
  definitions: ReadonlyArray<PackFeatureFlagRegistration>,
): void {
  registerPackFeatureFlags(
    definitions.map(({ group, ...definition }) => {
      if (!PACK_FLAG_KEY.test(definition.key)) {
        throw new Error(`Pack feature flag key must be lowercase and dotted: ${definition.key}`);
      }
      if (!isFeatureFlagGroup(group)) {
        throw new Error(`Pack feature flag ${definition.key} names an unknown group: ${group}`);
      }
      return { ...definition, group };
    }),
  );
}

export const loadPackFeatureFlags = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<void> => {
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineFeatureFlags: registerPackFeatureFlagDefinitions,
    });
  }
};
