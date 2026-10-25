/**
 * The ways out of a send that gave up waiting for its project (`project_not_resolved`). The
 * message stays on the draft throughout; each way only changes what the send waits for:
 *
 * - retry the match: `retryDraftCloudQueuedSend` (a fresh bound);
 * - send it in the machine's own project: the same retry, flagged so the project is the one the
 *   machine's server registered, whatever repository it is;
 * - start a plain session: the send is pointed at a session being created (the create's "plain"
 *   option from the create-failure toast), exactly as a Run-on pick of a new session does;
 * - cancel: `cancelDraftCloudQueuedSend` hands the text back to the composer to edit and resend.
 */
import type { ProjectId } from "@t3tools/contracts";

import { isCloudQueuedSendFailed, isProjectNotResolved } from "./t3team-cloudQueuedSendModel";
import {
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import { beginCloudSessionCreate } from "./t3team-cloudSessionTargetStore";

export function sendQueuedInMachineProject(draftId: string): void {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null || !isProjectNotResolved(current)) return;
  retryDraftCloudQueuedSend(draftId, { sendInMachineProject: true });
}

/** False when it cannot start: not a `project_not_resolved` failure, or no project to start in. */
export function startPlainSessionForQueuedSend(input: {
  readonly draftId: string;
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
  /** The draft's project on the primary environment, which the plain session is started for. */
  readonly projectId: ProjectId | undefined;
  readonly onCreate: (projectId?: ProjectId, options?: { readonly plain?: boolean }) => void;
}): boolean {
  const current = getDraftCloudQueuedSend(input.draftId);
  if (
    current === null ||
    !isCloudQueuedSendFailed(current) ||
    !isProjectNotResolved(current) ||
    input.scopeKey === null ||
    input.projectId === undefined
  ) {
    return false;
  }
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
    sessionId: CLOUD_SESSION_CREATING_ID,
    sessionLabel: "New plain cloud session",
    // The new session starts the steps over; only the time the message was queued is history.
    stepStartedAt: { queued: current.stepStartedAt?.queued ?? current.createdAt },
  });
  const { projectId } = input;
  beginCloudSessionCreate(
    { scopeKey: input.scopeKey, projectKey: input.projectKey },
    undefined,
    () => input.onCreate(projectId, { plain: true }),
  );
  return true;
}
