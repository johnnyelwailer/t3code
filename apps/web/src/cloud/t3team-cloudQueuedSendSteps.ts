/**
 * The step list of a queued cloud send: Queued → Machine → Server start → Connect → Project ready
 * → Sent. One pure module read by the composer banner (its title), the thread card (the rows and
 * bar) and the card's story, so the three cannot drift. The bar is the session's own provisioning
 * estimate (`presentCloudSession`); there is no second estimate.
 */
import type { CloudSession } from "@t3tools/contracts";

import {
  isCloudSessionProvisionPending,
  presentCloudSession,
} from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import { isCloudQueuedSendFailed, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

const CLOUD_QUEUED_SEND_STEP_IDS = [
  "queued",
  "machine",
  "server",
  "connect",
  "project",
  "sent",
] as const;
export type CloudQueuedSendStepId = (typeof CLOUD_QUEUED_SEND_STEP_IDS)[number];

const STEP_LABELS: Record<CloudQueuedSendStepId, string> = {
  queued: "Queued",
  machine: "Machine",
  server: "Server start",
  connect: "Connect",
  project: "Project ready",
  sent: "Sent",
};

export interface CloudQueuedSendStepFacts {
  readonly queued: CloudQueuedSend;
  readonly session: CloudSession | null;
  readonly machineConnected: boolean;
  readonly projectReady: boolean;
  /** A flusher in this window is dispatching the message right now. */
  readonly flushing: boolean;
}

type CloudSessionStepFacts = Omit<CloudQueuedSendStepFacts, "queued"> & {
  readonly queued?: CloudQueuedSend | undefined;
};

export interface CloudQueuedSendStepView {
  readonly id: CloudQueuedSendStepId;
  readonly label: string;
  readonly status: "done" | "running" | "failed" | "pending";
  /** Live wording for the step (the machine's current stage), or null. */
  readonly detail: string | null;
  readonly elapsedSeconds: number | null;
}

export interface CloudQueuedSendProgressView {
  readonly steps: ReadonlyArray<CloudQueuedSendStepView>;
  readonly currentStepId: CloudQueuedSendStepId;
  readonly failed: boolean;
  /** The composer banner's title for the current step. */
  readonly title: string;
  /** 0–1 from the session's provisioning estimate; full once the machine is up. */
  readonly progress: number;
}

function lastStampedStep(queued: CloudQueuedSend | undefined): CloudQueuedSendStepId | null {
  const stamps = queued?.stepStartedAt ?? {};
  return CLOUD_QUEUED_SEND_STEP_IDS.findLast((id) => stamps[id] !== undefined) ?? null;
}

/** Where the send is right now. A parked failure stays on the step it failed at. */
export function resolveCloudQueuedSendStepId(facts: CloudSessionStepFacts): CloudQueuedSendStepId {
  const { session } = facts;
  if (
    (facts.queued !== undefined && isCloudQueuedSendFailed(facts.queued)) ||
    (session && isTerminalCloudSessionPhase(session.phase))
  ) {
    return lastStampedStep(facts.queued) ?? "queued";
  }
  if (facts.flushing) return "sent";
  if (session === null || session.phase === "requested" || session.phase === "queued") {
    return "queued";
  }
  if (session.phase === "preparing") return "machine";
  if (session.phase === "starting") return "server";
  if (!facts.machineConnected) return "connect";
  if (!facts.projectReady) return "project";
  return "sent";
}

function stepTitle(id: CloudQueuedSendStepId, machineDetail: string | null): string {
  switch (id) {
    case "queued":
      return "Queued for cloud session…";
    case "machine":
      return `${machineDetail ?? "Starting machine"}…`;
    case "server":
      return "Starting server on cloud session…";
    case "connect":
      return "Connecting to cloud session…";
    case "project":
      return "Syncing project on cloud session…";
    case "sent":
      return "Sending to cloud session…";
  }
}

export function presentCloudQueuedSendProgress(
  facts: CloudSessionStepFacts,
  nowMs: number,
): CloudQueuedSendProgressView {
  const currentStepId = resolveCloudQueuedSendStepId(facts);
  const failed =
    (facts.queued !== undefined && isCloudQueuedSendFailed(facts.queued)) ||
    (facts.session !== null && isTerminalCloudSessionPhase(facts.session.phase));
  const current = CLOUD_QUEUED_SEND_STEP_IDS.indexOf(currentStepId);
  const stamps = facts.queued?.stepStartedAt ?? {};
  const presentation = facts.session === null ? null : presentCloudSession(facts.session);
  const machineDetail = facts.session?.phase === "preparing" ? (presentation?.title ?? null) : null;
  const steps = CLOUD_QUEUED_SEND_STEP_IDS.map((id, index): CloudQueuedSendStepView => {
    const startedAt = stamps[id] === undefined ? Number.NaN : Date.parse(stamps[id]);
    const nextStamp = CLOUD_QUEUED_SEND_STEP_IDS.slice(index + 1)
      .map((later) => (stamps[later] === undefined ? Number.NaN : Date.parse(stamps[later])))
      .find(Number.isFinite);
    const endedAt = index < current && nextStamp !== undefined ? nextStamp : nowMs;
    return {
      id,
      label: STEP_LABELS[id],
      status:
        index < current ? "done" : index > current ? "pending" : failed ? "failed" : "running",
      detail: id === "machine" && index === current ? machineDetail : null,
      elapsedSeconds:
        index <= current && Number.isFinite(startedAt)
          ? Math.max(0, Math.floor((endedAt - startedAt) / 1000))
          : null,
    };
  });
  const provisioning =
    facts.session !== null && isCloudSessionProvisionPending(facts.session.phase);
  return {
    steps,
    currentStepId,
    failed,
    title: failed
      ? "Cloud session failed"
      : facts.session === null
        ? "Waiting for cloud session status…"
        : stepTitle(currentStepId, machineDetail),
    progress: provisioning
      ? (presentation?.progress ?? 0)
      : current >= CLOUD_QUEUED_SEND_STEP_IDS.indexOf("connect")
        ? 1
        : 0,
  };
}
