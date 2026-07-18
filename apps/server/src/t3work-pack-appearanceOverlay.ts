import type { EnvironmentAppearance } from "@t3tools/contracts";

let appearanceOverlay: EnvironmentAppearance | undefined;

export function setPackAppearanceOverlay(appearance: EnvironmentAppearance | undefined): void {
  appearanceOverlay = appearance;
}

export function getPackAppearanceOverlay(): EnvironmentAppearance | undefined {
  return appearanceOverlay;
}
