/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import type { ReactNode } from "react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import { WorkItemStatusBadge } from "~/t3team/workitem/t3team-WorkItemStatusBadge";

/**
 * The title band is the item's identity: what kind of thing it is, what it is called, and where it
 * sits in the workflow.
 *
 * Only status stays beside the title. It is the one field the properties list deliberately does not
 * repeat — and the field people look for first and change most often — so it belongs here at every
 * width. Everything else (assignee, priority, size, due date, reporter) lives in the properties
 * panel; echoing it under the title was the redundancy the details row used to carry.
 */
export function WorkItemTitleBand({
  model,
  statusControl,
  titleControl,
  className,
}: {
  readonly model: WorkItemFieldModel;
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
        Status is the only field that stays in the band; assignee, priority, size and due date all
        live in the properties panel, so showing them here too was pure repetition.
      */}
      <div className="flex shrink-0 items-center @md/workitem:mt-0.5">
        {statusControl ?? <WorkItemStatusBadge status={model.status} />}
      </div>
    </div>
  );
}
