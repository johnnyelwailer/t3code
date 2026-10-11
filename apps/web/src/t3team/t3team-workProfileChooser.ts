import type { EnvironmentSetupProfile, ServerConfig } from "@t3tools/contracts";

import { resolveT3TeamPackDefaultSetupProfileId } from "~/t3team/t3team-packSetupProfiles";
import { resolveT3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";
import { readPrimaryServerConfig, useServerConfig } from "~/t3team/t3team-serverState";

/**
 * Client gate for the work profile chooser (first-run setup surface, add-project wizard profile
 * step, Settings default-profile picker). Server-authoritative runtime feature flag
 * (`NEXI_FF_WORK_PROFILE_CHOOSER`, default OFF) advertised as `ServerConfig.workProfileChooser`;
 * absent on older servers, which must be treated as OFF — hence the explicit `=== true`.
 *
 * While the chooser is off everyone works with the developer profile and any stored
 * `t3team:project-setup-profile` choice is IGNORED — never deleted or overwritten — so turning
 * the flag back on restores the user's own pick. Relanding: GHE hive/nx-nexi#60.
 */

/** Bundled engineering profile, used when no pack contributes an engineering profile. */
export const T3TEAM_FALLBACK_DEVELOPER_SETUP_PROFILE_ID = "engineering-copilot";

export function isT3TeamWorkProfileChooserEnabled(config: ServerConfig | null): boolean {
  return config?.workProfileChooser === true;
}

export function useT3TeamWorkProfileChooserEnabled(): boolean {
  return isT3TeamWorkProfileChooserEnabled(useServerConfig());
}

/** Non-reactive read, for call sites outside React (see `readT3TeamProjectSetupProfile`). */
export function readT3TeamWorkProfileChooserEnabled(): boolean {
  return isT3TeamWorkProfileChooserEnabled(readPrimaryServerConfig());
}

/**
 * The developer profile: the first pack profile in the `engineering` category — the server picks
 * the same one for its own default (see `t3team-pack-setupProfileDefault.ts`) — falling back to
 * the bundled engineering profile when no pack contributes one.
 */
export function resolveT3TeamDeveloperSetupProfileId(
  packProfiles: readonly EnvironmentSetupProfile[] | undefined,
): string {
  return (
    packProfiles?.find((profile) => profile.category === "engineering")?.id ??
    T3TEAM_FALLBACK_DEVELOPER_SETUP_PROFILE_ID
  );
}

/**
 * The profile that actually applies. Chooser ON is the historical rule: a stored id wins over
 * everything, and with nothing stored a pack-declared default outranks the bundled default.
 * Chooser OFF short-circuits to the developer profile without touching what is stored.
 */
export function resolveT3TeamEffectiveSetupProfileId(input: {
  readonly workProfileChooserEnabled: boolean;
  readonly storedProfileId: string | null | undefined;
  readonly packProfiles: readonly EnvironmentSetupProfile[] | undefined;
}): string {
  if (!input.workProfileChooserEnabled) {
    return resolveT3TeamDeveloperSetupProfileId(input.packProfiles);
  }
  const packDefaultProfileId = resolveT3TeamPackDefaultSetupProfileId(input.packProfiles);
  if (!input.storedProfileId?.trim() && packDefaultProfileId) return packDefaultProfileId;
  return resolveT3TeamProjectSetupProfileId(input.storedProfileId ?? undefined);
}
