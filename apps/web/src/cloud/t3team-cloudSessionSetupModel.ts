/**
 * The setup MODEL: a session snapshot turned into steps, the current one, and the timing it is
 * measured against. Changes when a poll lands; the clock-dependent readout lives in
 * `t3team-cloudSessionSetupReadout`. Pure.
 */
import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";

import { isCloudSessionProvisionPending } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import {
  cloudSetupShape,
  FALLBACK_TIMING,
  FINAL_STEP_SECONDS,
  needsRepositorySetup,
  STEP,
  STEP_IDS_BY_SHAPE,
  type CloudSetupShape,
  type CloudSetupStepId,
} from "./t3team-cloudSessionSetupSteps";

export type CloudSetupStepStatus = "done" | "current" | "upcoming";

export interface CloudSetupStepView {
  readonly id: CloudSetupStepId;
  readonly label: string;
  readonly status: CloudSetupStepStatus;
}

/** How a first message the user already typed is travelling with the session. */
export type CloudSetupDelivery = "none" | "queued" | "sending";

export interface CloudSetupFacts {
  /** A failure that is not the session's own, e.g. the queued message could not be delivered. */
  readonly sendFailure?: string | null;
  /** Null while the create request is still in flight and no session exists yet. */
  readonly session: CloudSession | null;
  /** The session's machine is a connected environment in this app. */
  readonly machineConnected: boolean;
  readonly delivery?: CloudSetupDelivery;
}

export type CloudSetupStage = "working" | "ready" | "failed";

export interface CloudSetupModel {
  readonly stage: CloudSetupStage;
  readonly shape: CloudSetupShape;
  readonly steps: readonly CloudSetupStepView[];
  /** Index into `steps`; the last index once ready. */
  readonly currentIndex: number;
  readonly currentStep: CloudSetupStepView;
  /** The sentence under the headline for the current step. */
  readonly activity: string;
  readonly timing: CloudSessionTiming;
  /** True when `timing` is the server's measurement, false for the built-in fallback. */
  readonly measured: boolean;
  /** Seconds from dispatch at which each step typically begins (parallel to `steps`). */
  readonly stepStarts: readonly number[];
  readonly delivery: CloudSetupDelivery;
  /** The repository work that can take many minutes: explain it, do not hide it. */
  readonly longWait: boolean;
  readonly failureReason: string | null;
  readonly detailsUrl: string | null;
  /** Headline: what is going on, in one phrase. */
  readonly title: string;
}

function sessionPendingStepId(
  session: CloudSession | null,
  shape: CloudSetupShape,
): CloudSetupStepId {
  if (session === null) return "reserve";
  switch (session.phase) {
    case "requested":
    case "queued":
      return "reserve";
    case "preparing": {
      if (shape === "plain") return "workspace";
      if (shape === "setup") return "fetch";
      return session.machineStage === "building"
        ? "build"
        : session.machineStage === "checking"
          ? "check"
          : session.machineStage === "installing"
            ? "install"
            : "fetch";
    }
    case "starting":
      return "start";
    default:
      return "start";
  }
}

export function isFinalStep(id: CloudSetupStepId | undefined): boolean {
  return id === "connect" || id === "deliver";
}

/**
 * Seconds from dispatch at which each step typically begins. Non-decreasing; a step the timing has
 * no mark for begins with the step before it (it takes no time of its own), and no step before
 * "connect" begins at or after the typical ready time.
 */
function monotonicStarts(
  ids: readonly CloudSetupStepId[],
  timing: CloudSessionTiming,
): readonly number[] {
  const marks = timing.startsAtSeconds;
  const ready = timing.readyTypicalSeconds;
  let previous = 0;
  return ids.map((id, index) => {
    if (index === 0) return 0;
    const mark = STEP[id].mark;
    const wanted =
      id === "connect" ? ready : id === "deliver" ? ready + FINAL_STEP_SECONDS : undefined;
    const given = mark === null ? undefined : marks[mark];
    const start = wanted ?? Math.min(given ?? previous, Math.max(previous, ready - 1));
    previous = Math.max(previous, start);
    return previous;
  });
}

export function buildCloudSessionSetup(facts: CloudSetupFacts): CloudSetupModel {
  const { session } = facts;
  const delivery = facts.delivery ?? "none";
  const shape = cloudSetupShape(session);
  const measuredTiming = session?.timing;
  const timing = measuredTiming ?? FALLBACK_TIMING[shape];
  // Connecting and sending only exist once a first message waits on the session: until then
  // nothing in this app asks for the machine, so "ready" is the end of the list.
  const ids: readonly CloudSetupStepId[] =
    delivery === "none"
      ? STEP_IDS_BY_SHAPE[shape]
      : ([...STEP_IDS_BY_SHAPE[shape], "connect", "deliver"] as const);

  const sendFailure = facts.sendFailure ?? null;
  const failed =
    sendFailure !== null ||
    (session !== null && (session.phase === "failed" || session.phase === "cancelled"));
  const pending = session === null || isCloudSessionProvisionPending(session.phase);
  const stage: CloudSetupStage = failed
    ? "failed"
    : session?.phase === "ready" && delivery === "none"
      ? "ready"
      : "working";

  let currentId: CloudSetupStepId;
  if (pending) currentId = sessionPendingStepId(session, shape);
  else if (session?.phase === "ready" && facts.machineConnected && delivery !== "none") {
    currentId = "deliver";
  } else currentId = "connect";
  if (stage === "ready") currentId = ids.at(-1)!;
  const rawIndex = ids.indexOf(currentId);
  const currentIndex = stage === "ready" ? ids.length - 1 : Math.max(0, rawIndex);
  const steps = ids.map((id, index): CloudSetupStepView => ({
    id,
    label: STEP[id].label,
    status:
      stage === "ready" || index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
  const currentStep = steps[currentIndex] ?? steps[0]!;
  return {
    stage,
    shape,
    steps,
    currentIndex,
    currentStep,
    activity: STEP[currentStep.id].activity,
    timing,
    measured: measuredTiming !== undefined && measuredTiming.samples > 0,
    stepStarts: monotonicStarts(ids, timing),
    delivery,
    longWait: needsRepositorySetup(shape) || timing.readyHighSeconds >= 240,
    failureReason: failed ? (sendFailure ?? session?.failureReason ?? null) : null,
    detailsUrl: failed ? (session?.detailsUrl ?? null) : null,
    title:
      stage === "failed"
        ? "Setup didn't finish"
        : stage === "ready"
          ? "Your cloud session is ready"
          : "Setting up your cloud session",
  };
}
