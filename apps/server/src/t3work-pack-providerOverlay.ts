import type { ProviderInstanceConfigMap } from "@t3tools/contracts";

let overlay: ProviderInstanceConfigMap = {} as ProviderInstanceConfigMap;

/** Boot-only overlay. Pack configuration remains in memory and is never persisted as user settings. */
export function setPackProviderOverlay(next: ProviderInstanceConfigMap): void {
  overlay = next;
}

export function getPackProviderOverlay(): ProviderInstanceConfigMap {
  return overlay;
}
