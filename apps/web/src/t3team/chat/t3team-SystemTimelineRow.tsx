import type { ScopedThreadRef } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import { findActiveWorkflowInputMessageId } from "~/t3team/chat/t3team-messageDecisionCard";
import type { T3TeamWorkflowDecisionAnswer } from "~/t3team/chat/t3team-workflowDecisionAnswers";
import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
} from "~/t3team/chat/t3team-messageExtViews";
import { findMessageView } from "~/t3team/chat/t3team-messageViewRegistry";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { isT3TeamFullBleedWidgetRow } from "~/t3team/chat/t3team-fullBleedWidgetRow";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { T3TeamSystemTimelineGenericRow } from "~/t3team/chat/t3team-SystemTimelineGenericRow";
import { T3TeamSystemTimelineNotificationBody } from "~/t3team/chat/t3team-SystemTimelineNotificationBody";

export interface T3TeamSystemTimelineRowProps {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd?: string | undefined;
  readonly activeWorkflowInputMessageId: string | null;
  /** Every answered ask, keyed by the ask message's id — lets this row keep rendering the ask's
   * card in an answered state instead of vanishing, and suppress the reply's own bare row. */
  readonly workflowDecisionAnswers?: ReadonlyMap<string, T3TeamWorkflowDecisionAnswer>;
  /** A run's short, honest banner outcome line (never the full result), keyed by workflowRunId —
   * see `t3team-workflowRunOutcome.ts`. */
  readonly workflowRunOutcomeSummaries?: ReadonlyMap<string, string>;
  /** Live per-run step progress derived from thread activities (keyed by workflowRunId). */
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: import("@t3tools/contracts").OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
}

export function T3TeamSystemTimelineRow(props: T3TeamSystemTimelineRowProps) {
  const { message, threadRef, markdownCwd } = props;

  // A decision reply is always posted as a `role: "user"` message (see
  // `t3team-thread-recipe-workflow-routes-resolve.ts`), so it renders through `UserTimelineRow`,
  // never through this system row. The ask card (`T3TeamWorkflowDecisionCard`) settles to show the
  // chosen value, so a card-sourced reply would say it twice — the timeline drops that row
  // (`isVisibleMessagesTimelineRow`) and the card is the one place the answer lives. A reply the
  // user TYPED in the composer instead still renders as its own bubble: it is ordinary prose, not
  // an echo of a chip. Both are matched to their ask by `t3teamExt.workflowReply.correlationId`
  // (see `t3team-workflowDecisionAnswers.ts`), which is also what tells the two cases apart.

  // A registered view that owns the whole row: the host's workflow shape and decision cards
  // (`t3team-hostMessageViews.tsx`), or a pack view posted with `Thread.showView`. A pack view's
  // own layout decides its width (`isT3TeamFullBleedWidgetRow`), so it gets no card chrome here.
  const rowView = findMessageView(message, "row");
  if (rowView) {
    const content = rowView.render({ threadRef, messageId: message.id, row: props });
    return rowView.entry.owner.kind === "host" ? (
      content
    ) : (
      <div className="w-full min-w-0">{content}</div>
    );
  }

  const genericAttachments = getT3TeamRenderableAttachments(message);
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  // Shape and decision rows returned above, so their echo of the message text is not a concern.
  const showMessageText = message.text.length > 0;

  const trustedHistoricalHtml =
    message.t3teamExt?.author?.kind === "system" &&
    message.t3teamExt.author.workflowRunId !== undefined &&
    /<\/?[a-z][^>]*>/i.test(message.text);
  if (trustedHistoricalHtml) {
    return (
      <div className="w-full">
        <T3TeamWidgetBlock
          widget={{
            widgetId: `historical-workflow:${message.id}`,
            title: "workflow_notification",
            format: message.text.trimStart().startsWith("<svg") ? "svg" : "html",
            html: message.text,
          }}
          threadRef={threadRef}
        />
      </div>
    );
  }

  // Full-bleed widget rows: the row wrapper in `MessagesTimeline` (branching on the same
  // predicate) already spans the full thread content width, so no inner width cap here.
  const widgetOnly = isT3TeamFullBleedWidgetRow(message);
  if (widgetOnly) {
    return (
      <div className="flex w-full flex-col items-start gap-2">
        {widgetAttachments.map((attachment) => (
          <T3TeamWidgetBlock
            key={`t3team-widget:${attachment.widget.widgetId}`}
            widget={attachment.widget}
            threadRef={threadRef}
          />
        ))}
      </div>
    );
  }

  const workflowNotification =
    message.t3teamExt?.author?.kind === "system" &&
    message.t3teamExt.author.workflowRunId !== undefined &&
    findMessageView(message, "card-body") === null &&
    genericAttachments.length === 0 &&
    widgetAttachments.length === 0;
  if (workflowNotification) {
    return showMessageText ? (
      <T3TeamSystemTimelineNotificationBody
        text={message.text}
        threadRef={threadRef}
        {...(markdownCwd ? { markdownCwd } : {})}
      />
    ) : null;
  }

  return <T3TeamSystemTimelineGenericRow row={props} showMessageText={showMessageText} />;
}

export { findActiveWorkflowInputMessageId };
