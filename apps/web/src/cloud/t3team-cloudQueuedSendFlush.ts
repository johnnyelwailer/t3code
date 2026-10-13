/**
 * What the app-level flusher does next for one queued cloud send. Pure: the flusher gathers the
 * live facts (session list, machine connection, project on that machine) and acts on the answer.
 */
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import { isCloudQueuedSendFailed, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

export const CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE =
  "The cloud session was not created. Send the message again to pick a machine.";
const CLOUD_QUEUED_SEND_ENDED_MESSAGE = "Cloud session ended before it could connect.";

export type CloudQueuedSendFlushAction =
  /** Nothing to do until the facts change (provisioning, syncing, parked on a failure). */
  | { readonly kind: "wait" }
  /** The create answered: stamp the real session id on the record. */
  | { readonly kind: "resolve-session"; readonly sessionId: string; readonly label: string }
  | { readonly kind: "connect"; readonly session: CloudSession }
  | { readonly kind: "fail"; readonly message: string; readonly retryable: boolean }
  /** The draft's thread already exists on the machine: an earlier dispatch went through. */
  | { readonly kind: "delivered"; readonly environmentId: EnvironmentId }
  | {
      readonly kind: "dispatch";
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
    };

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
  /** The draft's thread is already known on that machine. */
  readonly threadExists: boolean;
}): CloudQueuedSendFlushAction {
  const { queued, session } = input;
  if (isCloudQueuedSendFailed(queued)) return { kind: "wait" };
  if (queued.sessionId === CLOUD_SESSION_CREATING_ID) {
    if (input.target === null) {
      return { kind: "fail", message: CLOUD_QUEUED_SEND_NOT_CREATED_MESSAGE, retryable: false };
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
  if (isTerminalCloudSessionPhase(session.phase)) {
    return {
      kind: "fail",
      message: session.failureReason ?? CLOUD_QUEUED_SEND_ENDED_MESSAGE,
      retryable: false,
    };
  }
  if (input.connectFailure !== null && input.connectFailure.sessionId === session.sessionId) {
    return { kind: "fail", message: input.connectFailure.message, retryable: true };
  }
  if (session.phase !== "ready") return { kind: "wait" };
  // Broker sessions mint the environment id only once the VM reports in; connecting before
  // that fails with "still starting".
  if (environmentId === undefined) return { kind: "wait" };
  if (!input.machineConnected) return { kind: "connect", session };
  if (input.projectId === null) return { kind: "wait" };
  return { kind: "dispatch", environmentId, projectId: input.projectId };
}
