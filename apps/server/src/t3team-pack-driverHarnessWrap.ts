/**
 * Wraps a host `ProviderInstance` (Effect surface) back into a pack
 * `PackProviderInstance` (Promise / JSON surface). Used only by the
 * `createOpenCodeHarness` capability so a pack can compose and decorate the
 * reviewed host OpenCode harness; the orchestration adapter wrap lives in
 * `t3team-pack-driverHarnessSession.ts`.
 *
 * @module t3team-pack-driverHarnessWrap
 */
import type { PackProviderInstance, PackProviderSnapshot } from "@t3team/pack-api";
import type { ServerProvider } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import type { ProviderInstance } from "./provider/ProviderDriver.ts";
import { adapterToPack } from "./t3team-pack-driverHarnessSession.ts";

const serverToPackSnapshot = (snapshot: ServerProvider): PackProviderSnapshot => ({
  displayName: snapshot.displayName ?? snapshot.driver,
  enabled: snapshot.enabled,
  installed: snapshot.installed,
  version: snapshot.version,
  status: snapshot.status,
  authenticated: snapshot.auth.status === "authenticated",
  ...(snapshot.message ? { message: snapshot.message } : {}),
  models: snapshot.models.map((model) => ({
    slug: model.slug,
    name: model.name,
    isCustom: model.isCustom,
  })),
});

const degradedPackSnapshot = (driver: string): PackProviderSnapshot => ({
  displayName: driver,
  enabled: false,
  installed: false,
  version: null,
  status: "error",
  message: "Harness snapshot unavailable",
  models: [],
});

export const providerInstanceToPack = (
  instance: ProviderInstance,
  ambient: Context.Context<never>,
): PackProviderInstance => ({
  snapshot: () => {
    // getSnapshot is Ref-backed and synchronous today; runSyncExit guards a
    // future regression (async/services in getSnapshot) from becoming a
    // defect here — degrade to an error snapshot instead.
    const exit = Effect.runSyncExit(instance.snapshot.getSnapshot);
    return Exit.isSuccess(exit)
      ? serverToPackSnapshot(exit.value)
      : degradedPackSnapshot(String(instance.driverKind));
  },
  orchestration: adapterToPack(instance.orchestrationAdapter, ambient),
  // The harness resources belong to the instance scope the capability forked.
  dispose: () => Promise.resolve(),
});
