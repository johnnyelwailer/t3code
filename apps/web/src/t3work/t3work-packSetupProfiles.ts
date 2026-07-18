import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { primaryServerConfigAtom, primaryServerWelcomeAtom } from "../state/server";

/**
 * Setup profiles contributed by an active workspace pack, read from the primary
 * environment descriptor. Returns undefined when no pack provides any, so the
 * wizard falls back to the built-in generic catalog.
 */
export function useT3workPackSetupProfiles(): readonly EnvironmentSetupProfile[] | undefined {
  const config = useAtomValue(primaryServerConfigAtom)?.environment.setupProfiles;
  const welcome = useAtomValue(primaryServerWelcomeAtom)?.environment.setupProfiles;
  const profiles = welcome ?? config;
  return profiles && profiles.length > 0 ? profiles : undefined;
}
