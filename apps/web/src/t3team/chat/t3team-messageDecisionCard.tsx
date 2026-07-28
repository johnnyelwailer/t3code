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
import { CircleHelpIcon, CornerDownRightIcon } from "lucide-react";
import {
  isProjectRecipeWorkflowDecisionPayload,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
  type ProjectRecipeWorkflowDecisionPayload,
} from "@t3tools/project-recipes";

import type { ChatMessage } from "~/types";

import { T3TeamWorkflowQuestionProse } from "./t3team-WorkflowQuestionProse";
import { T3TeamWorkflowDecisionAffordance } from "./t3team-messageDecisionAffordance";

export type WorkflowDecisionChooseHandler = (input: {
  /** The chosen option label — the reply message's display text. */
  choice: string;
  /** The structured value resolve-input posts (the option, or `{ [field]: option }`). */
  value: unknown;
  /** The ask this card was rendered for; the server rejects it if no longer pending. */
  correlationId: string;
}) => Promise<void>;

export function getT3TeamWorkflowDecisionAttachment(
  message: Pick<ChatMessage, "t3teamExt">,
): ProjectRecipeWorkflowDecisionPayload | null {
  for (const attachment of message.t3teamExt?.attachments ?? []) {
    if (attachment.kind !== "view") {
      continue;
    }
    if (attachment.miniappId !== PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION) {
      continue;
    }
    if (isProjectRecipeWorkflowDecisionPayload(attachment.props)) {
      return attachment.props;
    }
  }

  return null;
}

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
  onChoose?: WorkflowDecisionChooseHandler | undefined;
}) {
  const { decision, active, unavailableMessage, onChoose } = props;
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
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <CircleHelpIcon className="size-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">Needs your input</span>
      </div>
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
