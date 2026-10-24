/**
 * The setup READOUT: the model at a clock reading. Cheap and pure, so a leaf may call it on its own
 * timer while nothing else re-renders.
 */
import {
  cloudSetupAnnouncement,
  basisTextOf,
  formatCloudSetupRemaining,
} from "./t3team-cloudSessionSetupCopy";
import {
  stepDurationSeconds,
  stepEndSeconds,
  stepMotion,
  type CloudSetupStepMotion,
} from "./t3team-cloudSessionSetupCurve";
import {
  isFinalStep,
  type CloudSetupModel,
  type CloudSetupStage,
} from "./t3team-cloudSessionSetupModel";
import { FINAL_STEP_CEILING } from "./t3team-cloudSessionSetupSteps";

export interface CloudSetupReadout {
  readonly stage: CloudSetupStage;
  /** 0-1; 1 only when the session is ready. */
  readonly progress: number;
  /** Past the slow end of the range and still working. */
  readonly slow: boolean;
  /** Seconds left as a range, null when ready, failed or slow. */
  readonly remaining: { readonly lowSeconds: number; readonly highSeconds: number } | null;
  /** "About 1-2 min left" / "Taking longer than usual" / "". */
  readonly estimateText: string;
  /** What the range is based on, or null when nothing honest can be said. */
  readonly basisText: string | null;
  /** Polite one-liner for assistive tech; changes with the step, not with the clock. */
  readonly announcement: string;
  /** Text for the progress bar's `aria-valuetext`. */
  readonly valueText: string;
  readonly motion: CloudSetupStepMotion;
}

export function readCloudSetup(model: CloudSetupModel, elapsedSeconds: number): CloudSetupReadout {
  const motion = stepMotion(model, elapsedSeconds);
  const announcement = cloudSetupAnnouncement(model);
  if (model.stage !== "working") {
    return {
      stage: model.stage,
      progress: model.stage === "ready" ? 1 : 0,
      slow: false,
      remaining: null,
      estimateText: "",
      basisText: null,
      announcement,
      valueText: announcement,
      motion: { from: model.stage === "ready" ? 1 : 0, to: 1, durationSeconds: 0, easing: [] },
    };
  }
  const { timing } = model;
  const ready = Math.max(1, timing.readyTypicalSeconds);
  const slow = elapsedSeconds > timing.readyHighSeconds;
  let remaining: CloudSetupReadout["remaining"] = null;
  if (!slow) {
    const index = model.currentIndex;
    const stepEnd = stepEndSeconds(model, index);
    const typical = isFinalStep(model.steps[index]?.id)
      ? Math.max(3, stepEnd - elapsedSeconds)
      : Math.max(
          ready - elapsedSeconds,
          ready - stepEnd + 0.25 * stepDurationSeconds(model, index),
        );
    const lowSeconds = Math.max(0, typical * (timing.readyLowSeconds / ready));
    const highSeconds = Math.max(timing.readyHighSeconds - elapsedSeconds, typical * 1.2, 20);
    remaining = { lowSeconds: Math.min(lowSeconds, highSeconds), highSeconds };
  }
  const estimateText = slow
    ? "Taking longer than usual"
    : remaining === null
      ? ""
      : formatCloudSetupRemaining(remaining.lowSeconds, remaining.highSeconds);
  return {
    stage: "working",
    progress: Math.min(FINAL_STEP_CEILING, Math.max(0, motion.from)),
    slow,
    remaining,
    estimateText,
    basisText: basisTextOf(model),
    announcement,
    valueText: slow
      ? `${model.currentStep.label}. Taking longer than usual.`
      : `${model.currentStep.label}. ${estimateText}.`,
    motion,
  };
}
