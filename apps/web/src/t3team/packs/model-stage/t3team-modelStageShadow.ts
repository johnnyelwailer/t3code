/**
 * CSS stand-in for the WebGL ground shadow (minimal/still tiers, and the loading poster).
 * Kept free of three.js so `ModelStage.tsx` never pulls the renderer into a still-only chunk.
 */
import type { ModelStageFlight } from "@t3team/pack-ui/contract";

/** Opacity 0–1 for the elliptical CSS blob under the stage. */
export function groundShadowCssOpacity(
  flight: ModelStageFlight | null | undefined,
  enabled: boolean,
): number {
  if (!enabled) return 0;
  const lift = flight?.lift ?? 0;
  if (lift <= 0.02) return 0.45;
  return Math.max(0, 0.45 * (1 - Math.min(1, lift / 0.35)));
}
