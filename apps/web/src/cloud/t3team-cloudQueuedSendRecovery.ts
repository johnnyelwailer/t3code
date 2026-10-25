/**
 * The ways out of a send that gave up waiting for its project (`project_not_resolved`). The
 * message stays on the draft throughout; each way only changes what the send waits for:
 *
 * - retry the match: `retryDraftCloudQueuedSend` (a fresh bound);
 * - send it in the machine's own project: the same retry, flagged so the project is the one the
 *   machine's server registered, whatever repository it is;
 * - start a plain session: a create with the "plain" option (from the create-failure toast) whose
 *   own answer moves the send onto the new session (`startPlainSessionForQueuedSend`);
 * - cancel: `cancelDraftCloudQueuedSend` hands the text back to the composer to edit and resend.
 */
import type { CloudSession, ProjectId } from "@t3tools/contracts";

import { cloudSessionDisplayName } from "~/components/cloud/t3team-cloudSessionDisplayName";

import { isCloudQueuedSendFailed, isProjectNotResolved } from "./t3team-cloudQueuedSendModel";
import {
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { isCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import { selectCloudSessionTarget } from "./t3team-cloudSessionTargetStore";
import type { CloudSessionCreateOptions } from "./t3team-useCloudSessionCreate";

export function sendQueuedInMachineProject(draftId: string): void {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null || !isProjectNotResolved(current)) return;
  retryDraftCloudQueuedSend(draftId, { sendInMachineProject: true });
}

/** Messages whose plain-session create is in flight in this window (memory only, like the dispatching set). */
const plainStarts = new Set<string>();

/** Forgets the in-flight creates, as an app restart does (tests). */
export function forgetPlainSessionStarts(): void {
  plainStarts.clear();
}

/**
 * Starts a plain session for the parked send and, when THAT create answers, moves the send onto
 * it. Until then the send stays parked on its own session: it is never given the creating
 * sentinel (the Run-on effect resolves a sentinel from the window's last created session, which
 * can be an earlier one), and it cannot be dispatched while parked, so it is on one session at a
 * time and the old one keeps nothing. A create that fails, or an app restart before it answers,
 * leaves the send parked and the action available again.
 *
 * False when nothing was started: the send is not parked on this failure, there is no project
 * to start in, a create is already running (this one's or another's), or the create refused.
 */
export function startPlainSessionForQueuedSend(input: {
  readonly draftId: string;
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
  /** The draft's project on the primary environment, which the plain session is started for. */
  readonly projectId: ProjectId | undefined;
  /** Another create is running: only one runs at a time, and this send must not adopt its result. */
  readonly createPending: boolean;
  readonly onCreate: (projectId?: ProjectId, options?: CloudSessionCreateOptions) => boolean;
}): boolean {
  const current = getDraftCloudQueuedSend(input.draftId);
  if (
    current === null ||
    !isCloudQueuedSendFailed(current) ||
    !isProjectNotResolved(current) ||
    input.scopeKey === null ||
    input.projectId === undefined ||
    input.createPending ||
    plainStarts.has(current.messageId)
  ) {
    return false;
  }
  const { draftId, scopeKey, projectKey, projectId } = input;
  const { messageId } = current;
  plainStarts.add(messageId);
  const started = input.onCreate(projectId, {
    plain: true,
    onCreated: (session) => {
      plainStarts.delete(messageId);
      moveParkedSendToSession({ draftId, messageId, scopeKey, projectKey, session });
    },
    onFailed: () => plainStarts.delete(messageId),
  });
  if (!started) plainStarts.delete(messageId);
  return started;
}

/**
 * Only a send still parked on this failure moves: one the user retried, cancelled or sent in the
 * meantime is left alone, and the new session is just a session.
 */
function moveParkedSendToSession(input: {
  readonly draftId: string;
  readonly messageId: string;
  readonly scopeKey: string;
  readonly projectKey: string | null;
  readonly session: CloudSession;
}): void {
  const current = getDraftCloudQueuedSend(input.draftId);
  if (
    current === null ||
    current.messageId !== input.messageId ||
    !isProjectNotResolved(current) ||
    isCloudQueuedSendDispatching(current.messageId)
  ) {
    return;
  }
  const label = cloudSessionDisplayName(input.session);
  const {
    failureMessage: _failure,
    retryable: _retryable,
    failureKind: _kind,
    failureReason: _reason,
    sendInMachineProject: _own,
    ...rest
  } = current;
  writeDraftCloudQueuedSend(input.draftId, {
    ...rest,
    sessionId: input.session.sessionId,
    sessionLabel: label,
    // The new session starts the steps over; only the time the message was queued is history.
    stepStartedAt: { queued: current.stepStartedAt?.queued ?? current.createdAt },
  });
  selectCloudSessionTarget({
    scopeKey: input.scopeKey,
    sessionId: input.session.sessionId,
    label,
    projectKey: input.projectKey,
  });
}
