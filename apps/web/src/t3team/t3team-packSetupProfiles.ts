import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { primaryServerConfigAtom, primaryServerWelcomeAtom } from "../state/server";

/**
 * Setup profiles contributed by an active workspace pack, read from the primary
 * environment descriptor. Returns undefined when no pack provides any, so the
 * wizard falls back to the built-in generic catalog.
 */
export function useT3TeamPackSetupProfiles(): readonly EnvironmentSetupProfile[] | undefined {
  const config = useAtomValue(primaryServerConfigAtom)?.environment.setupProfiles;
  const welcome = useAtomValue(primaryServerWelcomeAtom)?.environment.setupProfiles;
  const profiles = welcome ?? config;
  return profiles && profiles.length > 0 ? profiles : undefined;
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

/** Live pack default profile id, or undefined when no pack declares one. */
export function useT3TeamPackDefaultSetupProfileId(): string | undefined {
  return resolveT3TeamPackDefaultSetupProfileId(useT3TeamPackSetupProfiles());
}
