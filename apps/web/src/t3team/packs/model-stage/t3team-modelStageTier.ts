/**
 * Which tier a `ModelStage` renders, as a pure function of what the host knows. Kept apart from
 * React and three.js so the ladder is tested on its own (`t3team-modelStageTier.test.ts`).
 *
 * The ladder, richest first: `full` → `low` → `minimal` → `still`. Every signal can only take
 * the stage DOWN it; `quality` is a ceiling, never a floor.
 */
import type { ModelStageQuality, ModelStageTier } from "@t3team/pack-ui/contract";

export const MODEL_STAGE_TIERS: ReadonlyArray<ModelStageTier> = ["full", "low", "minimal", "still"];

/** A first-frames probe slower than this (mean ms per frame) drops one tier. */
export const MODEL_STAGE_PROBE_BUDGET_MS = 12;
/** Frames the probe times, after the first (shader compile) frames it skips. */
export const MODEL_STAGE_PROBE_FRAMES = 20;
export const MODEL_STAGE_PROBE_SKIP = 3;
/** Below this charge, while discharging, the stage stops using WebGL. */
export const MODEL_STAGE_LOW_BATTERY = 0.2;

export interface ModelStageSignals {
  readonly reducedMotion: boolean;
  /** `navigator.getBattery()`, where the browser has it; `null` when unknown. */
  readonly battery: { readonly charging: boolean; readonly level: number } | null;
  /** The desktop shell's power monitor; `null` in a browser. */
  readonly power: { readonly onBattery: boolean; readonly lowPower: boolean } | null;
  /**
   * Mean frame time of the first-frames probe of each WebGL tier this session, once it ran. A
   * `full` probe over budget drops to `low`, which then probes on its own.
   */
  readonly probeMs: { readonly full?: number; readonly low?: number };
  /** Whether a WebGL context can be made at all. */
  readonly webgl: boolean;
  /** Whether the pack shipped a pre-rendered loop (without one, `minimal` shows the still). */
  readonly hasLoop: boolean;
}

export interface ModelStageTierDecision {
  readonly tier: ModelStageTier;
  /** Why it is not `full`, for diagnostics and stories; empty when it is. */
  readonly reasons: ReadonlyArray<string>;
}

const rank = (tier: ModelStageTier) => MODEL_STAGE_TIERS.indexOf(tier);
const atMost = (tier: ModelStageTier, ceiling: ModelStageTier): ModelStageTier =>
  rank(tier) >= rank(ceiling) ? tier : ceiling;
const down = (tier: ModelStageTier): ModelStageTier =>
  MODEL_STAGE_TIERS[Math.min(rank(tier) + 1, MODEL_STAGE_TIERS.length - 1)] ?? "still";

export function selectModelStageTier(
  signals: ModelStageSignals,
  quality: ModelStageQuality = "auto",
): ModelStageTierDecision {
  const reasons: string[] = [];
  let tier: ModelStageTier = quality === "auto" ? "full" : quality;
  if (quality !== "auto" && quality !== "full") reasons.push(`quality: ${quality}`);
  const cap = (ceiling: ModelStageTier, reason: string) => {
    if (rank(ceiling) > rank(tier)) {
      tier = ceiling;
      reasons.push(reason);
    }
  };

  if (signals.reducedMotion) cap("still", "reduced motion");
  if (signals.power?.lowPower) cap("minimal", "low-power mode");
  if (
    signals.battery !== null &&
    !signals.battery.charging &&
    signals.battery.level < MODEL_STAGE_LOW_BATTERY
  ) {
    cap("minimal", "low battery");
  }
  if (signals.power?.onBattery) cap("low", "on battery");
  if (!signals.webgl) cap("minimal", "no WebGL");
  for (const probed of ["full", "low"] as const) {
    const ms = signals.probeMs[probed];
    if (tier === probed && ms !== undefined && ms > MODEL_STAGE_PROBE_BUDGET_MS) {
      tier = down(tier);
      reasons.push(`slow frames at ${probed} (${ms.toFixed(1)} ms)`);
    }
  }
  // `minimal` without a loop is the still: there is nothing else to show without WebGL.
  if (tier === "minimal" && !signals.hasLoop) tier = "still";
  return { tier: atMost(tier, quality === "auto" ? "full" : quality), reasons };
}

/** Mean of the timed frames of a probe, skipping the first ones (shader compiles, uploads). */
export function probeMeanMs(frameTimesMs: ReadonlyArray<number>): number | null {
  const timed = frameTimesMs.slice(MODEL_STAGE_PROBE_SKIP);
  if (timed.length < MODEL_STAGE_PROBE_FRAMES) return null;
  const window = timed.slice(0, MODEL_STAGE_PROBE_FRAMES);
  return window.reduce((sum, ms) => sum + ms, 0) / window.length;
}

/** Frame interval for a WebGL tier, in ms: 60 fps for `full`, 30 for `low`. */
export function frameIntervalMs(tier: "full" | "low"): number {
  return tier === "full" ? 1000 / 60 : 1000 / 30;
}
