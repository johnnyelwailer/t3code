import type { ReactNode } from "react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import {
  isWorkItemOverdue,
  type WorkItemFieldModel,
} from "~/t3team/workitem/t3team-workItemFieldModel";
import { WorkItemDate } from "~/t3team/workitem/t3team-WorkItemDate";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
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
  statusControl,
  titleControl,
  className,
}: {
  readonly model: WorkItemFieldModel;
  readonly nowMs: number;
  /** Slice B replaces the static badge with a transition picker. */
  readonly statusControl?: ReactNode;
  /** Slice B replaces the static heading with an inline editor. */
  readonly titleControl?: ReactNode;
  readonly className?: string;
}) {
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

        {model.assignee ? <WorkItemPersonChip person={model.assignee} /> : null}
        <WorkItemPriorityChip priority={model.priority} />

        {model.storyPoints !== undefined ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {model.storyPoints} pts
          </span>
        ) : null}

        {model.dueDateMs !== undefined ? (
          <WorkItemDate
            timestampMs={model.dueDateMs}
            nowMs={nowMs}
            emphasis={isWorkItemOverdue(model, nowMs)}
            className="text-xs text-muted-foreground"
          />
        ) : null}
      </div>
    </div>
  );
}
