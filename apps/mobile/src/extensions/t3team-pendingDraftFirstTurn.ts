import { withFirstTurnContext } from "../state/t3team-firstTurnContext";
import type { QueuedThreadMessage } from "../state/thread-outbox-model";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/**
 * The new task a draft sends, with its pending draft's `firstTurnContext` when the task goes to
 * that draft's project; a project the user picked elsewhere gets none.
 */
export function withPendingDraftFirstTurn(
  message: QueuedThreadMessage,
  pending: Pick<PendingDraft, "project" | "firstTurnContext"> | null,
): QueuedThreadMessage {
  if (
    pending?.firstTurnContext === undefined ||
    message.creation === undefined ||
    message.environmentId !== pending.project.environmentId ||
    message.creation.projectId !== pending.project.id
  ) {
    return message;
  }
  return withFirstTurnContext(message, pending.firstTurnContext);
}
