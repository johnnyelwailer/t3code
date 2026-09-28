/**
 * Delivers a "Comment" verb's feedback to the thread that proposed the draft (`sourceThreadId`).
 *
 * The feedback is a real user turn on that thread: the agent reads it and can propose again. This
 * is the reason `returned` is a distinct status from `discarded` — silence means drop it, a return
 * means there is something to act on — so the delivery must actually happen or say that it didn't.
 *
 * Delivery can legitimately fail: the server refuses `thread.turn.start` while the target thread
 * still has a turn running. That is reported to the reviewer (and left recorded on the draft) —
 * never swallowed, because a silently undelivered "send it back" looks identical to a delivered one.
 */

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { sendT3TeamThreadTurn } from "~/t3team/chat/t3team-sendThreadTurn";
import { environmentIdOfThread } from "~/t3team/chat/t3team-threadEnvironmentLookup";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutationField } from "~/t3team/t3team-draftMutationTypes";

export function buildDraftFeedbackText(input: {
  readonly issueIdOrKey: string;
  readonly field: T3TeamDraftMutationField;
  readonly feedback: string;
}): string {
  return [
    `I reviewed your proposed ${input.field} change to ${input.issueIdOrKey} and sent it back instead of applying it.`,
    "",
    input.feedback.trim(),
    "",
    "Revise the proposal with this in mind, or tell me why it should stand as written. Nothing has been written to Jira.",
  ].join("\n");
}

export async function deliverDraftFeedbackToSourceThread(input: {
  readonly sourceThreadId: string | undefined;
  readonly draftId: string;
  readonly issueIdOrKey: string;
  readonly field: T3TeamDraftMutationField;
  readonly feedback: string;
}): Promise<void> {
  if (!input.sourceThreadId || input.feedback.trim().length === 0) return;

  const environmentId = environmentIdOfThread(input.sourceThreadId);
  if (environmentId === null) {
    reportUndelivered(input.draftId, "The thread that proposed this draft is not connected.");
    return;
  }

  try {
    await sendT3TeamThreadTurn({
      environmentId,
      threadId: input.sourceThreadId,
      text: buildDraftFeedbackText(input),
    });
  } catch (error) {
    reportUndelivered(input.draftId, error instanceof Error ? error.message : String(error));
  }
}

/** Keeps the draft `returned` (the reviewer's decision stands) but records why the agent has not
 * heard about it, and tells the reviewer so they can retry from the thread itself. */
function reportUndelivered(draftId: string, reason: string): void {
  useT3TeamDraftMutationStore.getState().setDraftStatus(draftId, "returned", reason);
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title: "Feedback not delivered",
      description: `The draft is marked as returned, but the agent was not told: ${reason}`,
    }),
  );
}
