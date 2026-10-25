/**
 * What the app-level flusher does next for one queued cloud send. Pure: the flusher gathers the
 * live facts (session list, machine connection, project on that machine) and acts on the answer.
 */
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import type { CloudProjectWait } from "./t3team-cloudProjectWait";
import { cloudProjectWaitDetail } from "./t3team-cloudProjectWaitPresentation";
import { isCloudQueuedSendFailed, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

export const CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE =
  "The cloud session was still being created when the app reloaded. Pick it under Run on, then retry.";
const CLOUD_QUEUED_SEND_ENDED_MESSAGE = "Cloud session ended before it could connect.";

export type CloudQueuedSendFlushAction =
  /** Nothing to do until the facts change (provisioning, syncing, parked on a failure). */
  | { readonly kind: "wait" }
  /** The create answered: stamp the real session id on the record. */
  | { readonly kind: "resolve-session"; readonly sessionId: string; readonly label: string }
  | { readonly kind: "connect"; readonly session: CloudSession }
  /** A "No project" draft: open the machine's scratch project, then send there. */
  | { readonly kind: "open-scratch"; readonly environmentId: EnvironmentId }
  | {
      readonly kind: "fail";
      readonly message: string;
      readonly retryable: boolean;
      /** Set when the failure is typed; the message only words it. */
      readonly failure?: CloudQueuedSendFailure;
    }
  /** The draft's thread already exists on the machine: an earlier dispatch went through. */
  | { readonly kind: "delivered"; readonly environmentId: EnvironmentId }
  | {
      readonly kind: "dispatch";
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
    };

export interface CloudQueuedSendFailure {
  readonly kind: "project_not_resolved" | "session_ended";
  /** The classifier's reason (`CloudProjectWaitReason`) for `project_not_resolved`. */
  readonly reason: string | null;
  readonly environmentId: string | null;
}

/** The words of a send that gave up waiting for its project; the message is kept. */
export function cloudProjectNotResolvedMessage(wait: CloudProjectWait): string {
  return `The project did not appear on the cloud machine in time. ${cloudProjectWaitDetail(wait)}. Your message is kept: retry, send it in the machine's own project, start a plain session, or cancel to edit it.`;
}

export function decideCloudQueuedSendFlush(input: {
  readonly queued: CloudQueuedSend;
  /** The in-memory Run-on target of this draft, when this window still has it. */
  readonly target: { readonly sessionId: string; readonly label: string } | null;
  readonly session: CloudSession | null;
  readonly connectFailure: { readonly sessionId: string; readonly message: string } | null;
  /** The session's machine is a connected environment on this client. */
  readonly machineConnected: boolean;
  /** The draft's project on that machine, once it has synced there. */
  readonly projectId: ProjectId | null;
  /** The draft is a "No project" thread, whose project on the machine is opened on demand. */
  readonly scratch: boolean;
  /** The draft's thread is already known on that machine. */
  readonly threadExists: boolean;
  /** What the project is waiting on (`CloudQueuedSendFacts.projectWait`). */
  readonly projectWait?: CloudProjectWait | null;
  /** The "Project ready" bound has run out (`isCloudProjectWaitExpired`). */
  readonly projectWaitExpired?: boolean;
  /** The machine's connection is parked because its session no longer exists. */
  readonly environmentSessionEnded?: boolean;
}): CloudQueuedSendFlushAction {
  const { queued, session } = input;
  if (isCloudQueuedSendFailed(queued)) return { kind: "wait" };
  if (queued.sessionId === CLOUD_SESSION_CREATING_ID) {
    // A reload while the create was in flight loses the answer; once the user picks the
    // session under Run on, a retry resolves it.
    if (input.target === null) {
      return { kind: "fail", message: CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE, retryable: true };
    }
    return input.target.sessionId === CLOUD_SESSION_CREATING_ID
      ? { kind: "wait" }
      : { kind: "resolve-session", sessionId: input.target.sessionId, label: input.target.label };
  }
  // The list can lag a fresh create; the next poll brings it.
  if (session === null) return { kind: "wait" };
  const environmentId = session.environmentId as EnvironmentId | undefined;
  if (environmentId !== undefined && input.machineConnected && input.threadExists) {
    return { kind: "delivered", environmentId };
  }
  // The list is a bounded, polled history; the attach's `session_ended` can say so sooner.
  if (
    isTerminalCloudSessionPhase(session.phase) ||
    (input.environmentSessionEnded === true && !input.machineConnected)
  ) {
    return {
      kind: "fail",
      message: session.failureReason ?? CLOUD_QUEUED_SEND_ENDED_MESSAGE,
      retryable: false,
      failure: { kind: "session_ended", reason: null, environmentId: environmentId ?? null },
    };
  }
  if (input.connectFailure !== null && input.connectFailure.sessionId === session.sessionId) {
    return { kind: "fail", message: input.connectFailure.message, retryable: true };
  }
  if (session.phase !== "ready") return { kind: "wait" };
  // Broker sessions mint the environment id only once the VM reports in; connecting before
  // that fails with "still starting". A T3 Connect session whose workflow published no id is
  // matched through relay discovery on connect, as the ChatView bind flush did.
  if (environmentId === undefined) {
    return session.transport === "nexi_broker" ? { kind: "wait" } : { kind: "connect", session };
  }
  if (!input.machineConnected) return { kind: "connect", session };
  if (input.projectId === null) {
    if (input.scratch) return { kind: "open-scratch", environmentId };
    const wait = input.projectWait ?? null;
    if (input.projectWaitExpired !== true || wait === null) return { kind: "wait" };
    // A project that has not appeared by the bound is a typed, kept failure, not a wait.
    return {
      kind: "fail",
      message: cloudProjectNotResolvedMessage(wait),
      retryable: true,
      failure: { kind: "project_not_resolved", reason: wait.reason, environmentId },
    };
  }
  return { kind: "dispatch", environmentId, projectId: input.projectId };
}
