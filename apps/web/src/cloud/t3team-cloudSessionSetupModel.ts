import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";

import { cloudSessionProvisionTiming } from "~/components/cloud/t3team-cloudSessionProvisionTiming";
import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  presentCloudQueuedSendProgress,
  type CloudQueuedSendStepId,
} from "./t3team-cloudQueuedSendSteps";

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
  readonly queued?: CloudQueuedSend | undefined;
  readonly delivery?: CloudSetupDelivery;
}
export type CloudSetupStage = "working" | "ready" | "failed";
export interface CloudSetupModel {
  readonly stage: CloudSetupStage;
  readonly session: CloudSession | null;
  readonly steps: readonly CloudSetupStepView[];
  readonly currentStep: CloudSetupStepView;
  readonly activity: string;
  readonly timing: CloudSessionTiming;
  readonly measured: boolean;
  readonly delivery: CloudSetupDelivery;
  readonly longWait: boolean;
  readonly failureReason: string | null;
  readonly detailsUrl: string | null;
  readonly title: string;
}

export function buildCloudSessionSetup(facts: CloudSetupFacts): CloudSetupModel {
  const { session } = facts;
  const delivery = facts.delivery ?? "none";
  const view = presentCloudQueuedSendProgress(
    {
      ...facts,
      projectReady: facts.projectReady ?? false,
      flushing: delivery === "sending",
    },
    0,
  );
  const failed = view.failed || facts.sendFailure != null;
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
  const timing = cloudSessionProvisionTiming(session);
  return {
    stage,
    session,
    steps,
    currentStep,
    activity: view.title,
    timing,
    measured: session?.timing !== undefined && timing.samples > 0,
    delivery,
    longWait: session?.projectMachine === true || session?.machineSetup === true,
    failureReason: failed
      ? (facts.sendFailure ??
        facts.queued?.failureMessage ??
        session?.failureReason ??
        (terminal ? "Cloud session ended before it could connect." : null))
      : null,
    detailsUrl: failed ? (session?.detailsUrl ?? null) : null,
    title: failed
      ? "Setup didn't finish"
      : stage === "ready"
        ? "Your cloud session is ready"
        : "Setting up your cloud session",
  };
}
