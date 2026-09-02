/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The `askUser` decision card (Epic 25 §askUser decision cards) — renders the
 * `t3team.workflow.decision` view a workflow's escalation message carries: a distinct bordered
 * "needs your input" card with the question and, for a `choice` affordance, the options as
 * buttons. Attached resources ride as sibling resource attachments on the same message and are
 * rendered by the existing attachment list, not here. The freeform composer remains the escape
 * hatch for every affordance, so the card never blocks a reply.
 *
 * Only the LIVE card accepts clicks: a card is active while its message is the thread's latest
 * `waiting-for-input` message with no user reply after it (mirrors
 * `isThreadWaitingForRecipeInput`); older cards in the history render disabled.
 */
import { useState } from "react";
import { CheckIcon, CircleHelpIcon, CornerDownRightIcon } from "lucide-react";

import type { ProjectRecipeWorkflowDecisionPayload } from "@t3tools/project-recipes";

import type { ChatMessage } from "~/types";

import { T3TeamWorkflowQuestionProse } from "./t3team-WorkflowQuestionProse";
import { T3TeamWorkflowDecisionAffordance } from "./t3team-messageDecisionAffordance";
import type { T3TeamWorkflowDecisionAnswer } from "./t3team-workflowDecisionAnswers";
// Re-exported for existing callers — the attachment lookup itself now lives in
// `t3team-workflowDecisionAnswers.ts` so that module doesn't need to import back from here (that
// was the other half of a type/value import cycle between the two files).
export { getT3TeamWorkflowDecisionAttachment } from "./t3team-workflowDecisionAnswers";

export type WorkflowDecisionChooseHandler = (input: {
  /** The chosen option label — the reply message's display text. */
  choice: string;
  /** The structured value resolve-input posts (the option, or `{ [field]: option }`). */
  value: unknown;
  /** The ask this card was rendered for; the server rejects it if no longer pending. */
  correlationId: string;
}) => Promise<void>;

/**
 * The message currently awaiting the user's answer: the latest `waiting-for-input` message with
 * no user message after it. Older decision cards (answered or superseded) render disabled.
 */
export function findActiveWorkflowInputMessageId(
  timelineEntries: ReadonlyArray<{ readonly kind: string; readonly message?: ChatMessage }>,
): string | null {
  let lastWaitingId: string | null = null;
  let lastWaitingIndex = -1;
  let lastUserIndex = -1;
  for (let index = 0; index < timelineEntries.length; index += 1) {
    const entry = timelineEntries[index];
    const message = entry?.kind === "message" ? entry.message : undefined;
    if (message === undefined) {
      continue;
    }
    if (message.t3teamExt?.status === "waiting-for-input") {
      lastWaitingId = message.id;
      lastWaitingIndex = index;
    }
    if (message.role === "user") {
      lastUserIndex = index;
    }
  }
  return lastWaitingIndex > lastUserIndex ? lastWaitingId : null;
}

export function T3TeamWorkflowDecisionCard(props: {
  decision: ProjectRecipeWorkflowDecisionPayload;
  active: boolean;
  /** Terminal runs withdraw their pending ask; do not leave dead reply controls in the timeline. */
  unavailableMessage?: string | undefined;
  /** The reply that answered this ask, when one exists — keeps the card in a settled state
   * (question + highlighted choice, header switched to "Answered") instead of either vanishing
   * or looking eternally pending. This card IS where the value is shown for a card-sourced reply:
   * the timeline drops that reply's own bubble (`isVisibleMessagesTimelineRow`) because the
   * highlighted choice above already states it, and rendering both said it twice. A reply the user
   * TYPED in the composer is not suppressed — it is ordinary prose rather than an echo of a chip,
   * and `t3teamExt.workflowReply.correlationId` is what distinguishes the two. */
  answer?: T3TeamWorkflowDecisionAnswer | undefined;
  onChoose?: WorkflowDecisionChooseHandler | undefined;
}) {
  const { decision, active, unavailableMessage, answer, onChoose } = props;
  const [submitting, setSubmitting] = useState<string | null>(null);
  const affordance = decision.affordance;
  const unavailable = unavailableMessage !== undefined;
  const locked = unavailable || !active || !onChoose || submitting !== null;

  // Every affordance funnels through one submit: optimistic-lock on the chosen label, post the
  // structured value, release the lock when the round-trip settles.
  const runChoose = (choice: string, value: unknown) => {
    if (!onChoose || locked) {
      return;
    }
    setSubmitting(choice);
    void onChoose({ choice, value, correlationId: decision.correlationId }).finally(() =>
      setSubmitting((current) => (current === choice ? null : current)),
    );
  };

  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      {answer ? (
        <div
          className="mb-2 flex items-center gap-1.5 text-muted-foreground"
          data-workflow-decision-status="answered"
        >
          <CheckIcon className="size-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Answered</span>
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-1.5 text-primary">
          <CircleHelpIcon className="size-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Needs your input</span>
        </div>
      )}
      <T3TeamWorkflowQuestionProse question={decision.question} />

      {unavailable ? (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-workflow-decision-status="unavailable"
        >
          {unavailableMessage}
        </p>
      ) : null}

      {unavailable ? null : (
        <T3TeamWorkflowDecisionAffordance
          affordance={affordance}
          correlationId={decision.correlationId}
          submitting={submitting}
          locked={locked}
          formDisabled={!active || !onChoose}
          {...(answer ? { answeredChoice: answer.text } : {})}
          onChoose={runChoose}
        />
      )}

      {/*
        The run is BLOCKED here. A muted one-liner read as a status note, so the card looked like a
        spinner and the user waited for something that was waiting for them. A text ask has no
        buttons at all, so it needs the loudest pointer to where the answer goes.
      */}
      {active && !unavailable ? (
        <p
          className={
            affordance.kind === "text"
              ? "mt-3 flex items-center gap-1.5 text-sm font-medium text-primary"
              : "mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
          }
          data-workflow-decision-status="awaiting-answer"
        >
          <CornerDownRightIcon className="size-3.5 shrink-0" />
          {affordance.kind === "text"
            ? "Type your answer in the composer below — nothing runs until you do."
            : "…or reply in the composer below."}
        </p>
      ) : null}
    </div>
  );
}
