/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import type { ReactNode } from "react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import {
  formatWorkItemDuration,
  isWorkItemOverdue,
  type WorkItemFieldModel,
} from "~/t3team/workitem/t3team-workItemFieldModel";
import { WorkItemDate } from "~/t3team/workitem/t3team-WorkItemDate";
import {
  WorkItemPersonAvatar,
  WorkItemPersonChip,
} from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { WorkItemPriorityChip } from "~/t3team/workitem/t3team-WorkItemPriorityIcon";
import { WorkItemStatusBadge } from "~/t3team/workitem/t3team-WorkItemStatusBadge";

/**
 * The title band is the item's identity: what kind of thing it is, what it is called, and where it
 * sits in the workflow.
 *
 * Status appears here and nowhere else. It is the field people look for first and change most
 * often, so it belongs beside the title at every width — and putting it here means the properties
 * rail does not have to repeat it, which is one less duplicated control on a phone.
 */
export function WorkItemTitleBand({
  model,
  nowMs,
  currentUserName,
  statusControl,
  titleControl,
  assigneeControl,
  className,
}: {
  readonly model: WorkItemFieldModel;
  readonly nowMs: number;
  readonly currentUserName?: string | undefined;
  /** Slice B replaces the static badge with a transition picker. */
  readonly statusControl?: ReactNode;
  /** Slice B replaces the static heading with an inline editor. */
  readonly titleControl?: ReactNode;
  /** Slice B replaces the assignee chip with a search-and-assign popover. */
  readonly assigneeControl?: ReactNode;
  readonly className?: string;
}) {
  /**
   * How big is this? Teams answer that in points or in time, rarely both, and some only ever record
   * what they have already spent. Show whichever this item actually carries, labelled so an estimate
   * is never mistaken for time already burned — and show nothing at all rather than an empty
   * placeholder for the teams that track none of it.
   */
  const estimateLabel = (() => {
    if (model.storyPoints !== undefined) return `${model.storyPoints} pts`;
    const estimate = formatWorkItemDuration(model.timeTracking?.originalEstimateSeconds);
    if (estimate) return `${estimate} est`;
    const logged = formatWorkItemDuration(model.timeTracking?.timeSpentSeconds);
    return logged ? `${logged} logged` : undefined;
  })();

  const isAssignedToCurrentUser =
    currentUserName !== undefined &&
    model.assignee !== undefined &&
    model.assignee.displayName.trim().toLowerCase() === currentUserName.trim().toLowerCase();

  return (
    /*
      One row from `@md` up, two rows below it — driven by flex-basis rather than by rendering the
      status twice behind visibility classes, so the control mounts exactly once. Slice B puts a
      popover in that slot, and two mounted popovers would mean duplicate ids and split state.
    */
    <div className={cn("flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2.5", className)}>
      <div className="flex min-w-0 basis-full items-start gap-2.5 @md/workitem:flex-1 @md/workitem:basis-auto">
        <JiraIssueTypeIcon
          issueType={model.issueType}
          {...(model.issueTypeIconUrl ? { issueTypeIconUrl: model.issueTypeIconUrl } : {})}
          className="mt-1 size-5 @2xl/workitem:mt-1.5"
        />

        <div className="min-w-0 flex-1">
          {titleControl ?? (
            <h1 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground @2xl/workitem:text-xl">
              {model.title}
            </h1>
          )}
        </div>
      </div>

      {/*
        Status shares its row with the fields people look for in the same glance: who owns it, how
        urgent it is, its size and whether it is late. These were only in the properties list, which
        collapses on a narrow column — so on a phone the answer to "who is on this" was two taps away.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 @md/workitem:mt-0.5">
        {statusControl ?? <WorkItemStatusBadge status={model.status} />}

        {/*
          Always rendered, unassigned included. Who owns an item is a primary question, and an empty
          space is not an answer — "nobody" is, and it is the one that prompts someone to pick it up.
        */}
        {assigneeControl ?? (
          <WorkItemPersonChip person={model.assignee} isCurrentUser={isAssignedToCurrentUser} />
        )}

        {estimateLabel ? (
          <span className="text-xs tabular-nums text-muted-foreground">{estimateLabel}</span>
        ) : null}

        <WorkItemPriorityChip priority={model.priority} />

        {model.dueDateMs !== undefined ? (
          <WorkItemDate
            timestampMs={model.dueDateMs}
            nowMs={nowMs}
            emphasis={isWorkItemOverdue(model, nowMs)}
            className="text-xs text-muted-foreground"
          />
        ) : null}

        {/*
          Reporter last, and as a face rather than a name. It is the least-consulted field here, and
          spelling it out next to the size read as though that person logged the time — adjacency
          implies a relationship the row does not intend. The name is on hover, where it is enough.
        */}
        {model.reporter ? (
          <span title={`Reported by ${model.reporter.displayName}`} className="flex items-center">
            <WorkItemPersonAvatar person={model.reporter} size="sm" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
