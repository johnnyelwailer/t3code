/**
 * Pack driver snapshot bridge.
 *
 * Maps a pack `PackProviderSnapshot` (plain data) into the host's
 * `ServerProviderShape`. `getSnapshot` / `refresh` recompute live from the
 * pack instance; the resulting `ServerProvider` is re-stamped with the
 * bridged instance id + driver kind. v1 does not forward `subscribeSnapshot`
 * push updates onto `streamChanges` (consumers poll via `refresh`).
 *
 * @module t3team-pack-driverSnapshot
 */
import {
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type { PackProviderInstance, PackProviderSnapshot } from "@t3team/packs";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { makeManualOnlyProviderMaintenanceCapabilities } from "./provider/providerMaintenance.ts";
import { buildServerProvider } from "./provider/providerSnapshot.ts";
import type { ServerProviderShape } from "./provider/Services/ServerProvider.ts";

const toModels = (snapshot: PackProviderSnapshot): ReadonlyArray<ServerProviderModel> =>
  snapshot.models.map((model) => ({
    slug: model.slug,
    name: model.name,
    isCustom: model.isCustom ?? true,
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

type SnapshotInput = {
  readonly packInstance: PackProviderInstance;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor: string | undefined;
  readonly iconDataUrl: string | undefined;
  readonly continuationKey: string;
};

/** Degraded snapshot when the pack's `snapshot()` throws or returns malformed data. */
const degradedServerProvider = (
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

export const makePackProviderSnapshot = (input: SnapshotInput): ServerProviderShape => {
  const getSnapshot = Effect.gen(function* () {
    const checkedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
    return yield* Effect.sync(() =>
      // Guards both the pack `snapshot()` call and the mapping: a throwing or
      // malformed snapshot becomes a defect we catch into a degraded snapshot
      // instead of escaping.
      packSnapshotToServerProvider({
        ...input,
        checkedAt,
        snapshot: input.packInstance.snapshot(),
      }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Pack provider snapshot() failed", {
          driverKind: input.driverKind,
          instanceId: input.instanceId,
          cause,
        }).pipe(Effect.as(degradedServerProvider(input, checkedAt, Cause.squash(cause)))),
      ),
    );
  });
  return {
    maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
      provider: input.driverKind,
      packageName: null,
    }),
    getSnapshot,
    refresh: getSnapshot,
    get streamChanges() {
      return Stream.empty as Stream.Stream<ServerProvider>;
    },
  };
};
