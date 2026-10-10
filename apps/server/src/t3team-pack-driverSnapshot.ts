/**
 * Pack driver snapshot mapping.
 *
 * Maps a pack `PackProviderSnapshot` (plain data) into the host's
 * `ServerProvider`, re-stamped with the bridged instance id + driver kind,
 * and builds the degraded snapshot for a throwing/malformed pack. The
 * stateful `ServerProviderShape` lives in `t3team-pack-driverSnapshotShape.ts`.
 *
 * @module t3team-pack-driverSnapshot
 */
import {
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type { PackProviderInstance, PackProviderSnapshot } from "@t3team/pack-api";

import { buildServerProvider } from "./provider/providerSnapshot.ts";

const toModels = (snapshot: PackProviderSnapshot): ReadonlyArray<ServerProviderModel> =>
  snapshot.models.map((model) => ({
    slug: model.slug,
    name: model.name,
    // A pack's declared models are that provider's built-ins. Defaulting to
    // custom made the web picker drop them all after upstream #9075 started
    // rebuilding custom rows from Settings (GHE nexi-distribution#394).
    isCustom: model.isCustom ?? false,
    capabilities: null,
  }));

export const packSnapshotToServerProvider = (input: {
  readonly snapshot: PackProviderSnapshot;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor: string | undefined;
  readonly iconDataUrl: string | undefined;
  readonly continuationKey: string;
  readonly checkedAt: string;
}): ServerProvider => {
  const { snapshot } = input;
  const draft = buildServerProvider({
    driver: input.driverKind,
    presentation: { displayName: input.displayName ?? snapshot.displayName },
    enabled: snapshot.enabled,
    checkedAt: input.checkedAt,
    models: toModels(snapshot),
    probe: {
      installed: snapshot.installed,
      version: snapshot.version ?? null,
      status: snapshot.status === "disabled" ? "ready" : snapshot.status,
      auth: { status: snapshot.authenticated === true ? "authenticated" : "unknown" },
      ...(snapshot.message ? { message: snapshot.message } : {}),
    },
  });
  return {
    ...draft,
    instanceId: input.instanceId,
    driver: input.driverKind,
    configurationSource: "pack",
    availability: "available",
    continuation: { groupKey: input.continuationKey },
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    ...(input.iconDataUrl ? { iconDataUrl: input.iconDataUrl } : {}),
    // Only forwarded when the pack opts out; absent means the host default (true).
    ...(snapshot.showInteractionModeToggle === false ? { showInteractionModeToggle: false } : {}),
  };
};

export type SnapshotInput = {
  readonly packInstance: PackProviderInstance;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor: string | undefined;
  readonly iconDataUrl: string | undefined;
  readonly continuationKey: string;
};

/** Degraded snapshot when the pack's `snapshot()` throws or returns malformed data. */
export const degradedServerProvider = (
  input: SnapshotInput,
  checkedAt: string,
  cause: unknown,
): ServerProvider => {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const draft = buildServerProvider({
    driver: input.driverKind,
    presentation: { displayName: input.displayName ?? String(input.driverKind) },
    // Enabled so `buildServerProvider` surfaces the error status (a disabled
    // provider is forced to status "disabled"); `installed: false` still marks
    // it unusable.
    enabled: true,
    checkedAt,
    models: [],
    probe: {
      installed: false,
      version: null,
      status: "error",
      auth: { status: "unknown" },
      message: `Pack provider snapshot failed: ${detail}`,
    },
  });
  return {
    ...draft,
    instanceId: input.instanceId,
    driver: input.driverKind,
    configurationSource: "pack",
    availability: "available",
    continuation: { groupKey: input.continuationKey },
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    ...(input.iconDataUrl ? { iconDataUrl: input.iconDataUrl } : {}),
  };
};
