import type { ProviderInstanceConfigMap } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";
import type { PackProviderDriverDefinition } from "@t3team/packs";

import { makeOpenCodeHarnessDriver } from "./provider/Drivers/OpenCodeDriver.ts";
import type { AnyProviderDriver } from "./provider/ProviderDriver.ts";
import { bridgePackProviderDriver } from "./t3team-pack-driverBridge.ts";

/**
 * Boot-only pack provider overlay. Carries both the data-only instance
 * config map (used to synthesize instances) and any executable driver
 * definitions registered via `defineProviderDriver`.
 */
export type PackProviderOverlay = {
  readonly configMap: ProviderInstanceConfigMap;
  readonly driverDefinitions: ReadonlyMap<string, PackProviderDriverDefinition>;
};

let overlay: ProviderInstanceConfigMap = {} as ProviderInstanceConfigMap;
let driverDefinitions: ReadonlyMap<string, PackProviderDriverDefinition> = new Map();

/** Boot-only overlay. Pack configuration remains in memory and is never persisted as user settings. */
export function setPackProviderOverlay(next: PackProviderOverlay): void {
  overlay = next.configMap;
  driverDefinitions = next.driverDefinitions;
}

export function getPackProviderOverlay(): ProviderInstanceConfigMap {
  return overlay;
}

/**
 * Builds host-owned drivers for the identities declared by the boot-only pack
 * overlay. A driver registered via `defineProviderDriver` is bridged into an
 * executable `ProviderDriver`; identities without an executable definition
 * fall back to the reviewed OpenCode harness (full back-compat for data-only
 * `AgentProviderDefinition`s).
 */
export function getPackProviderDrivers(): ReadonlyArray<AnyProviderDriver<any>> {
  const displayNames = new Map<string, string>();
  for (const entry of Object.values(overlay)) {
    if (entry.driver === "opencode") continue;
    displayNames.set(entry.driver, entry.displayName ?? entry.driver);
  }

  const drivers: Array<AnyProviderDriver<any>> = [];
  const built = new Set<string>();
  for (const [kind, displayName] of displayNames) {
    const definition = driverDefinitions.get(kind);
    drivers.push(
      definition
        ? bridgePackProviderDriver(definition)
        : makeOpenCodeHarnessDriver({ driverKind: ProviderDriverKind.make(kind), displayName }),
    );
    built.add(kind);
  }
  // Executable drivers whose id has no data-only instance entry still register.
  for (const [kind, definition] of driverDefinitions) {
    if (built.has(kind)) continue;
    drivers.push(bridgePackProviderDriver(definition));
  }
  return drivers;
}
