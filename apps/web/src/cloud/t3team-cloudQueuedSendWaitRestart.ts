/**
 * Retry while the send is still waiting for its project. Dropping the "Project ready" stamp is
 * what restarts the wait: the flush loop evaluates the send afresh and stamps the step again, so
 * its wording, its bound and the connect → project path all start over. A parked send is not this
 * case — `retryDraftCloudQueuedSend` clears the failure for that one.
 */
import { isCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import { getDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";

/**
 * Restarts the wait of a waiting (not parked) send. False when there is nothing to restart: no
 * record, a parked one, a dispatch already in flight, or a second click whose stamp is gone.
 */
export function restartDraftCloudQueuedSendWait(draftId: string): boolean {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null || current.failureMessage !== undefined) return false;
  if (isCloudQueuedSendDispatching(current.messageId)) return false;
  const { stepStartedAt, ...rest } = current;
  const { project: started, ...stamps } = stepStartedAt ?? {};
  if (started === undefined) return false;
  return writeDraftCloudQueuedSend(draftId, { ...rest, stepStartedAt: stamps });
}
