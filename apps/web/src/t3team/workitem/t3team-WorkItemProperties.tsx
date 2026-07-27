import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import {
  formatWorkItemDuration,
  isWorkItemOverdue,
  type WorkItemFieldModel,
} from "~/t3team/workitem/t3team-workItemFieldModel";
import { WorkItemDate } from "~/t3team/workitem/t3team-WorkItemDate";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { WorkItemPriorityChip } from "~/t3team/workitem/t3team-WorkItemPriorityIcon";
import {
  WorkItemPropertyChips,
  WorkItemPropertyRow,
} from "~/t3team/workitem/t3team-WorkItemPropertyRow";

/**
 * The properties list.
 *
 * Order follows how people scan an item: who owns it, how urgent it is, how it is classified, then
 * when things happened. Status is absent by design — the title band owns it, so it is never shown
 * twice and never needs a duplicate control on a phone.
 *
 * In the rail this is a plain list with no container of its own; the rail's own separator is enough
 * structure. In the narrow layout the caller wraps it in a collapsed section, where a bordered panel
 * would be a box inside a box.
 */
export function WorkItemProperties({
  model,
  nowMs,
  assigneeControl,
  estimateControl,
  className,
}: {
  readonly model: WorkItemFieldModel;
  readonly nowMs: number;
  /** Slice B replaces the assignee chip with a search-and-assign popover. */
  readonly assigneeControl?: ReactNode;
  /** Slice B replaces the static points value with a click-to-edit number. */
  readonly estimateControl?: ReactNode;
  readonly className?: string;
}) {
  const overdue = isWorkItemOverdue(model, nowMs);
  const timeSpent = formatWorkItemDuration(model.timeTracking?.timeSpentSeconds);
  const remaining = formatWorkItemDuration(model.timeTracking?.remainingEstimateSeconds);
  const originalEstimate = formatWorkItemDuration(model.timeTracking?.originalEstimateSeconds);

  return (
    <dl
      className={cn(
        "grid gap-y-2.5 @sm/workitem:grid-cols-2 @sm/workitem:gap-x-5 @4xl/workitem:grid-cols-1 @4xl/workitem:gap-x-0",
        className,
      )}
    >
      <WorkItemPropertyRow label="Assignee" value={model.assignee?.displayName ?? "—"}>
        {assigneeControl ?? <WorkItemPersonChip person={model.assignee} />}
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Reporter" value={model.reporter?.displayName}>
        <WorkItemPersonChip person={model.reporter} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Priority" value={model.priority}>
        <WorkItemPriorityChip priority={model.priority} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Points" value={model.storyPoints}>
        {estimateControl ?? <span className="tabular-nums">{model.storyPoints}</span>}
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Sprint" values={model.sprints}>
        <WorkItemPropertyChips values={model.sprints.map((sprint) => sprint.name)} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Labels" values={model.labels}>
        <WorkItemPropertyChips values={model.labels} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Components" values={model.components}>
        <WorkItemPropertyChips values={model.components.map((component) => component.name)} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Fix version" values={model.fixVersions}>
        <WorkItemPropertyChips values={model.fixVersions.map((version) => version.name)} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Affects" values={model.affectsVersions}>
        <WorkItemPropertyChips values={model.affectsVersions.map((version) => version.name)} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Due" value={model.dueDateMs}>
        <WorkItemDate timestampMs={model.dueDateMs ?? 0} nowMs={nowMs} emphasis={overdue} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Estimate" value={originalEstimate} />

      <WorkItemPropertyRow label="Logged" value={timeSpent}>
        <span>
          {timeSpent}
          {remaining ? <span className="text-muted-foreground"> · {remaining} left</span> : null}
        </span>
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Resolution" value={model.resolution} />

      <WorkItemPropertyRow label="Created" value={model.createdMs}>
        <WorkItemDate timestampMs={model.createdMs ?? 0} nowMs={nowMs} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Updated" value={model.updatedMs}>
        <WorkItemDate timestampMs={model.updatedMs ?? 0} nowMs={nowMs} />
      </WorkItemPropertyRow>

      <WorkItemPropertyRow label="Environment" value={model.environment} />
    </dl>
  );
}
