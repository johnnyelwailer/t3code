/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The completion card for a proposed draft: what the agent did, and one click to go read it.
 *
 * A finished rewrite used to announce itself only as prose in the conversation, leaving the reader to work
 * out that the actual proposal was on a different surface. This carries the agent's own one-line summary and
 * navigates to the work item, so "it's done" and "here it is" are the same affordance.
 *
 * Presentational: it takes `onOpen` rather than routing itself, so the timeline stays router-agnostic (the
 * same shape the workflow-decision card and the actor card use for their callbacks).
 */

import { SquarePenIcon } from "lucide-react";
import type { T3TeamMessageWorkItemDraftRefAttachment } from "@t3tools/contracts";

export type T3TeamWorkItemDraftRefOpenHandler = (input: {
  readonly projectId: string;
  readonly issueIdOrKey: string;
}) => void;

/** The card face when the producer left no summary — the message body is the better sentence. */
export function workItemDraftRefSummary(
  attachment: T3TeamMessageWorkItemDraftRefAttachment,
  fallbackText: string | undefined,
): string {
  const summary = attachment.summary?.trim();
  if (summary) return summary;

  const sentence = fallbackText
    ?.trim()
    .split(/(?<=[.!?])\s/)[0]
    ?.trim();
  if (sentence) return sentence;

  return attachment.field
    ? `Proposed ${attachment.field} change`
    : "Proposed change ready for review";
}

export function T3TeamWorkItemDraftRefCard({
  attachment,
  fallbackText,
  onOpen,
}: {
  readonly attachment: T3TeamMessageWorkItemDraftRefAttachment;
  /** The message body, used for the summary when the attachment carries none. */
  readonly fallbackText?: string | undefined;
  readonly onOpen?: T3TeamWorkItemDraftRefOpenHandler | undefined;
}) {
  const summary = workItemDraftRefSummary(attachment, fallbackText);
  const label = `Review the proposed ${attachment.field ?? "change"} for ${attachment.issueIdOrKey}`;

  if (!onOpen) {
    return (
      <div className="space-y-1" data-work-item-draft-ref={attachment.issueIdOrKey}>
        <span className="font-medium text-foreground">{summary}</span>
        <span className="block text-xs text-muted-foreground">{attachment.issueIdOrKey}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-work-item-draft-ref={attachment.issueIdOrKey}
      className="group flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() =>
        onOpen({ projectId: attachment.projectId, issueIdOrKey: attachment.issueIdOrKey })
      }
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-medium text-foreground">{summary}</span>
        <span className="block text-xs text-muted-foreground">
          {attachment.issueIdOrKey} · review the proposal
        </span>
      </span>
      <SquarePenIcon className="size-3.5 shrink-0 text-primary opacity-70 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
