import type { CloudSession } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import type { CloudProjectWait } from "./t3team-cloudProjectWait";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  presentCloudQueuedSendProgress,
  type CloudQueuedSendStepFacts,
  type CloudQueuedSendStepId,
} from "./t3team-cloudQueuedSendSteps";

/** The thread card's controls for a draft's waiting first message, as the composer gate gives them. */
export interface CloudQueuedSendCardInput {
  readonly facts: CloudQueuedSendStepFacts;
  readonly onCancel: () => void;
  /** Null when retrying cannot help (the session ended). */
  readonly onRetry: (() => void) | null;
}

export type CloudSetupStepStatus = "done" | "current" | "upcoming";
export interface CloudSetupStepView {
  readonly id: CloudQueuedSendStepId;
  readonly label: string;
  readonly status: CloudSetupStepStatus;
}
export type CloudSetupDelivery = "none" | "queued" | "sending";
export interface CloudSetupFacts {
  readonly sendFailure?: string | null;
  readonly session: CloudSession | null;
  readonly machineConnected: boolean;
  readonly projectReady?: boolean;
  readonly projectWait?: CloudProjectWait | null | undefined;
  readonly queued?: CloudQueuedSend | undefined;
  readonly delivery?: CloudSetupDelivery;
  /** The session has stayed out of the session list for longer than a fresh create can explain. */
  readonly lost?: boolean;
}
export type CloudSetupStage = "working" | "ready" | "failed";
export interface CloudSetupModel {
  readonly stage: CloudSetupStage;
  readonly session: CloudSession | null;
  readonly steps: readonly CloudSetupStepView[];
  readonly currentStep: CloudSetupStepView;
  readonly activity: string;
  readonly delivery: CloudSetupDelivery;
  readonly machineConnected: boolean;
  readonly longWait: boolean;
  /** What the "Project ready" step waits on while it is the current step; the card words it. */
  readonly projectWait: CloudProjectWait | null;
  readonly failureReason: string | null;
  readonly detailsUrl: string | null;
  readonly title: string;
}

export const CLOUD_SETUP_LOST_MESSAGE =
  "No status has arrived for this cloud session. It may not have started.";
const CLOUD_SETUP_ENDED_MESSAGE = "Cloud session ended before it could connect.";

export function buildCloudSessionSetup(facts: CloudSetupFacts): CloudSetupModel {
  const { session } = facts;
  const delivery = facts.delivery ?? "none";
  const lost = session === null && facts.lost === true;
  const view = presentCloudQueuedSendProgress(
    {
      ...facts,
      projectReady: facts.projectReady ?? false,
      flushing: delivery === "sending",
    },
    0,
  );
  const failed = view.failed || facts.sendFailure != null || lost;
  const stage = failed
    ? "failed"
    : session?.phase === "ready" && delivery === "none"
      ? "ready"
      : "working";
  const steps = view.steps
    .filter((step) => delivery !== "none" || ["queued", "machine", "server"].includes(step.id))
    .map((step): CloudSetupStepView => ({
      id: step.id,
      label: step.detail ?? step.label,
      status:
        stage === "ready" || step.status === "done"
          ? "done"
          : step.id === view.currentStepId
            ? "current"
            : "upcoming",
    }));
  const fallback: CloudSetupStepView = { id: "queued", label: "Queued", status: "upcoming" };
  const currentStep =
    steps.find((step) => step.id === view.currentStepId) ?? steps.at(-1) ?? fallback;
  const terminal = session !== null && isTerminalCloudSessionPhase(session.phase);
  return {
    stage,
    session,
    steps,
    currentStep,
    activity: view.title,
    delivery,
    machineConnected: facts.machineConnected,
    projectWait: view.projectWait === null ? null : (facts.projectWait ?? null),
    longWait: session?.projectMachine === true || session?.machineSetup === true,
    failureReason: failed
      ? (facts.sendFailure ??
        facts.queued?.failureMessage ??
        session?.failureReason ??
        (terminal ? CLOUD_SETUP_ENDED_MESSAGE : lost ? CLOUD_SETUP_LOST_MESSAGE : null))
      : null,
    detailsUrl: failed ? (session?.detailsUrl ?? null) : null,
    title: failed
      ? "Setup didn't finish"
      : stage === "ready"
        ? "Your cloud session is ready"
        : "Setting up your cloud session",
  };
}

/**
 * Which ways out the card offers. A dead session (ended, or never seen in the list) cannot take a
 * retry. A fresh session only helps a card with no waiting message: that message stays bound to
 * the session it was queued for, so the card offers to cancel it instead.
 */
export function cloudSetupRecovery(input: {
  readonly session: CloudSession | null;
  readonly lost: boolean;
  readonly hasQueued: boolean;
  readonly canRetry: boolean;
}): { readonly retry: boolean; readonly tryAgain: boolean } {
  const dead =
    input.lost || (input.session !== null && isTerminalCloudSessionPhase(input.session.phase));
  return { retry: input.canRetry && !dead, tryAgain: !input.hasQueued && dead };
}
