/**
 * Where the progress bar is and how it moves: each step eases from its start towards its end on
 * an exponential curve that flattens short of the next step, so time alone can never push the bar
 * past the step the session is really on. Also the clock helper and the CSS easing stops. Pure.
 */
import {
  CLOUD_SETUP_PROGRESS_CEILING,
  CONNECT_STEP_CEILING,
  FINAL_STEP_CEILING,
  FINAL_STEP_SECONDS,
} from "./t3team-cloudSessionSetupSteps";
import { isFinalStep, type CloudSetupModel } from "./t3team-cloudSessionSetupModel";

/** How close to a step's end its curve flattens, so the bar eases in rather than stopping dead. */
const STEP_CURVE_SPAN = 0.96;
/** A step's curve is 99.3 % complete after this many time constants. */
const CURVE_TIME_CONSTANTS = 5;

/** The server's seconds-since-dispatch for a snapshot, plus the time since the client got it. */
export function cloudSetupElapsedSeconds(
  snapshotElapsedSeconds: number,
  snapshotAtMs: number,
  nowMs: number,
): number {
  return Math.max(0, snapshotElapsedSeconds + Math.max(0, nowMs - snapshotAtMs) / 1000);
}

export function stepEndSeconds(model: CloudSetupModel, index: number): number {
  const start = model.stepStarts[index] ?? 0;
  // The last step before "ready" ends when the session is typically ready.
  const next =
    model.stepStarts[index + 1] ??
    (isFinalStep(model.steps[index]?.id) ? undefined : model.timing.readyTypicalSeconds);
  return next !== undefined && next > start ? next : start + FINAL_STEP_SECONDS;
}

export function stepDurationSeconds(model: CloudSetupModel, index: number): number {
  const start = model.stepStarts[index] ?? 0;
  return Math.max(5, stepEndSeconds(model, index) - start);
}

/** Bar fraction at which `index` begins and at which its curve flattens. */
function stepFractionSpan(
  model: CloudSetupModel,
  index: number,
): { readonly from: number; readonly to: number } {
  const ready = Math.max(1, model.timing.readyTypicalSeconds);
  const id = model.steps[index]?.id;
  if (id === "connect") {
    return { from: CLOUD_SETUP_PROGRESS_CEILING, to: CONNECT_STEP_CEILING };
  }
  if (id === "deliver") return { from: CONNECT_STEP_CEILING, to: FINAL_STEP_CEILING };
  const fractionOf = (seconds: number) =>
    Math.min(CLOUD_SETUP_PROGRESS_CEILING, (seconds / ready) * CLOUD_SETUP_PROGRESS_CEILING);
  const from = fractionOf(model.stepStarts[index] ?? 0);
  const next = fractionOf(model.stepStarts[index + 1] ?? ready);
  return { from, to: Math.max(from, next) };
}

function curve(seconds: number, timeConstant: number): number {
  return 1 - Math.exp(-Math.max(0, seconds) / timeConstant);
}

export interface CloudSetupStepMotion {
  /** Bar fraction now, and the fraction the step's curve flattens at. */
  readonly from: number;
  readonly to: number;
  /** Seconds until the curve has flattened; 0 means nothing left to animate. */
  readonly durationSeconds: number;
  /** CSS `linear()` stops (0..1) matching the model's exponential approach. */
  readonly easing: readonly number[];
}

const EASING_STOPS = 8;

export function stepMotion(model: CloudSetupModel, elapsedSeconds: number): CloudSetupStepMotion {
  const index = model.currentIndex;
  const { from, to } = stepFractionSpan(model, index);
  const start = model.stepStarts[index] ?? 0;
  const timeConstant = stepDurationSeconds(model, index) / 2;
  const sNow = Math.max(0, elapsedSeconds - start);
  const sEnd = timeConstant * CURVE_TIME_CONSTANTS;
  const span = to - from;
  const at = (s: number) => from + span * STEP_CURVE_SPAN * curve(s, timeConstant);
  const now = at(sNow);
  const end = at(sEnd);
  if (sNow >= sEnd || end - now < 0.002) {
    return { from: now, to: now, durationSeconds: 0, easing: [] };
  }
  const easing = Array.from({ length: EASING_STOPS + 1 }, (_, i) => {
    const s = sNow + ((sEnd - sNow) * i) / EASING_STOPS;
    return Math.min(1, Math.max(0, (at(s) - now) / (end - now)));
  });
  return { from: now, to: end, durationSeconds: sEnd - sNow, easing };
}
