import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryServerConfigAtom, primaryServerWelcomeAtom } from "../state/server";

function pickSetupProfiles(
  welcome: readonly EnvironmentSetupProfile[] | undefined,
  config: readonly EnvironmentSetupProfile[] | undefined,
): readonly EnvironmentSetupProfile[] | undefined {
  const profiles = welcome ?? config;
  return profiles && profiles.length > 0 ? profiles : undefined;
}

/**
 * Setup profiles contributed by an active workspace pack, read from the primary
 * environment descriptor. Returns undefined when no pack provides any, so the
 * wizard falls back to the built-in generic catalog.
 */
export function useT3TeamPackSetupProfiles(): readonly EnvironmentSetupProfile[] | undefined {
  return pickSetupProfiles(
    useAtomValue(primaryServerWelcomeAtom)?.environment.setupProfiles,
    useAtomValue(primaryServerConfigAtom)?.environment.setupProfiles,
  );
}

/** Non-reactive read of the same descriptors, for call sites outside React. */
export function readT3TeamPackSetupProfiles(): readonly EnvironmentSetupProfile[] | undefined {
  return pickSetupProfiles(
    appAtomRegistry.get(primaryServerWelcomeAtom)?.environment.setupProfiles,
    appAtomRegistry.get(primaryServerConfigAtom)?.environment.setupProfiles,
  );
}

/**
 * Id of the pack profile flagged `default: true`, used to preselect a card when
 * nothing is stored yet. When several pack profiles claim the flag the FIRST
 * REGISTERED one wins (descriptor order) — deterministic, never throws.
 */
export function resolveT3TeamPackDefaultSetupProfileId(
  profiles: readonly EnvironmentSetupProfile[] | undefined,
): string | undefined {
  return profiles?.find((profile) => profile.default === true)?.id;
}
