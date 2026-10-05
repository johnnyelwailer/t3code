import type { PackProviderDriverDefinition } from "@t3team/pack-api";
import type { PackProviderDriverRegistration } from "@t3team/packs";

/**
 * Narrows a pack's provider-driver registration to the `@t3team/pack-api` contract. Only
 * schemaVersion 2 (an orchestration V2 adapter) is accepted: a schemaVersion 1 driver (the
 * retired V1 adapter surface) fails here, at activation, instead of at its first session.
 */
export const toPackProviderDriverDefinition = (
  packId: string,
  registration: PackProviderDriverRegistration,
): PackProviderDriverDefinition => {
  if (registration.schemaVersion !== 2) {
    throw new Error(
      `Pack ${packId} provider driver ${registration.driver} uses schemaVersion ${String(
        registration.schemaVersion,
      )}; this host requires schemaVersion 2 (orchestration V2 adapter)`,
    );
  }
  if (typeof (registration as { readonly create?: unknown }).create !== "function") {
    throw new Error(`Pack ${packId} provider driver ${registration.driver} has no create function`);
  }
  return registration as PackProviderDriverRegistration & PackProviderDriverDefinition;
};
