/**
 * Inputs of the fork's rich timeline rows (workflow / decision / recipe cards, workflow step
 * progress), carried on `MessagesTimeline`'s single `t3team` extension prop.
 *
 * The row router that consumes them is fed from the fork side streams (thread facts and
 * artifacts); every field is optional so the timeline renders plain V2 rows without them.
 */
import type { MessageId, OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { T3TeamThreadActivityRecord } from "~/t3team/chat/t3team-threadActivityRecord";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

export interface T3TeamTimelineRowProps {
  /** Workflow step / recipe card records of this thread (step progress, launch cards). */
  readonly threadActivities?: ReadonlyArray<T3TeamThreadActivityRecord>;
  /** Durable state of the workflow run launched from this thread (thread fact). */
  readonly workflowRunStatus?: OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  /** Opens a peer thread of the same project (workflow child links, actor cards). */
  readonly onOpenProjectThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
  /** Scroll request from the workflow dock to a card row; `requestId` makes repeats distinct. */
  readonly workflowCardNavigationRequest?: {
    readonly messageId: MessageId;
    readonly requestId: number;
  } | null;
}
