/**
 * The host's own `message.view`s, registered into the same view registry pack views use: the
 * workflow shape card, the workflow decision (ask) card, and the workflow card body.
 *
 * Shape and decision own their whole timeline row, and are listed in the order the timeline
 * checks them (a message carrying both renders as its shape). The workflow card renders inside
 * the generic system card, after the message text. Host views keep their old behaviour for props
 * that do not decode: the attachment is hidden rather than shown as a generic attachment row.
 */
import {
  isProjectRecipeWorkflowCardActivityPayload,
  isProjectRecipeWorkflowDecisionPayload,
  isProjectRecipeWorkflowShapePayload,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
  type ProjectRecipeWorkflowDecisionPayload,
} from "@t3tools/project-recipes";
import type { ReactNode } from "react";

import type { PackViewContext } from "~/t3team/packs/t3team-PackMessageView";
import type { MessageViewEntry, MessageViewPlacement } from "~/t3team/packs/t3team-viewRegistry";

import { T3TeamWorkflowCardBody } from "./t3team-messageExtViews";
import { T3TeamSystemTimelineDecisionRow } from "./t3team-SystemTimelineDecisionRow";
import type { T3TeamSystemTimelineRowProps } from "./t3team-SystemTimelineRow";
import { T3TeamSystemTimelineShapeRow } from "./t3team-SystemTimelineShapeRow";
import { workflowDecisionUnavailableMessage } from "./t3team-workflowDecisionAvailability";

/** What a timeline `message.view` renders with: the pack view context plus the whole row. */
export interface MessageViewRowContext extends PackViewContext {
  readonly row: T3TeamSystemTimelineRowProps;
}

type Bind = MessageViewEntry<MessageViewRowContext>["bind"];

const hostView = (
  id: string,
  placement: MessageViewPlacement,
  bind: Bind,
): MessageViewEntry<MessageViewRowContext> => ({
  id,
  owner: { kind: "host" },
  placement,
  layout: "lane",
  bind,
});

function DecisionView({
  row,
  workflowDecision,
}: {
  readonly row: T3TeamSystemTimelineRowProps;
  readonly workflowDecision: ProjectRecipeWorkflowDecisionPayload;
}): ReactNode {
  const answer = row.workflowDecisionAnswers?.get(row.message.id);
  const stepRun = workflowDecision.workflowRunId
    ? row.workflowStepRuns?.get(workflowDecision.workflowRunId)
    : undefined;
  return (
    <T3TeamSystemTimelineDecisionRow
      message={row.message}
      threadRef={row.threadRef}
      workflowDecision={workflowDecision}
      activeWorkflowInputMessageId={row.activeWorkflowInputMessageId}
      decisionUnavailableMessage={workflowDecisionUnavailableMessage(
        workflowDecision,
        row.workflowRunStatus,
        stepRun,
        answer !== undefined,
      )}
      {...(answer ? { answer } : {})}
      {...(row.onSubmitRecipeCardAction
        ? { onSubmitRecipeCardAction: row.onSubmitRecipeCardAction }
        : {})}
      {...(row.dispatchWorkflowDecision
        ? { dispatchWorkflowDecision: row.dispatchWorkflowDecision }
        : {})}
    />
  );
}

export const HOST_MESSAGE_VIEWS: ReadonlyArray<MessageViewEntry<MessageViewRowContext>> = [
  hostView(PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE, "row", (props) => {
    if (!isProjectRecipeWorkflowShapePayload(props)) return null;
    return ({ row }) => {
      const outcomeSummary =
        props.workflowRunId !== undefined
          ? row.workflowRunOutcomeSummaries?.get(props.workflowRunId)
          : undefined;
      return (
        <T3TeamSystemTimelineShapeRow
          workflowShape={props}
          threadRef={row.threadRef}
          {...(row.workflowStepRuns ? { workflowStepRuns: row.workflowStepRuns } : {})}
          {...(row.workflowRunStatus ? { workflowRunStatus: row.workflowRunStatus } : {})}
          {...(row.onControlWorkflow ? { onControlWorkflow: row.onControlWorkflow } : {})}
          {...(row.onOpenThread ? { onOpenThread: row.onOpenThread } : {})}
          {...(outcomeSummary ? { outcomeSummary } : {})}
        />
      );
    };
  }),
  hostView(PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION, "row", (props) =>
    isProjectRecipeWorkflowDecisionPayload(props)
      ? ({ row }) => <DecisionView row={row} workflowDecision={props} />
      : null,
  ),
  hostView(PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD, "card-body", (props) =>
    isProjectRecipeWorkflowCardActivityPayload(props)
      ? ({ row }) => (
          <T3TeamWorkflowCardBody
            workflowCard={props}
            {...(row.onSubmitRecipeCardAction
              ? { onSubmitRecipeCardAction: row.onSubmitRecipeCardAction }
              : {})}
          />
        )
      : null,
  ),
];
