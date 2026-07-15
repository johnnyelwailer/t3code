import type { ProviderInstanceConfigMap } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";

import { makeOpenCodeHarnessDriver } from "./provider/Drivers/OpenCodeDriver.ts";
import type { AnyProviderDriver } from "./provider/ProviderDriver.ts";

let overlay: ProviderInstanceConfigMap = {} as ProviderInstanceConfigMap;

/** Boot-only overlay. Pack configuration remains in memory and is never persisted as user settings. */
export function setPackProviderOverlay(next: ProviderInstanceConfigMap): void {
  overlay = next;
}

export function getPackProviderOverlay(): ProviderInstanceConfigMap {
  return overlay;
}

/** Builds host-owned drivers for the identities declared by the boot-only pack overlay. */
export function getPackProviderDrivers(): ReadonlyArray<AnyProviderDriver<any>> {
  const kinds = new Map<string, string>();
  for (const entry of Object.values(overlay)) {
    if (entry.driver === "opencode") continue;
    kinds.set(entry.driver, entry.displayName ?? entry.driver);
  }
  return [...kinds].map(([kind, displayName]) =>
    makeOpenCodeHarnessDriver({ driverKind: ProviderDriverKind.make(kind), displayName }),
  );
}
