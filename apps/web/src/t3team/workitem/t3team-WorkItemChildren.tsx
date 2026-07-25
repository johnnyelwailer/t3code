import { cn } from "~/t3team/lib/t3team-utils";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemIssueList, WorkItemIssueRow } from "~/t3team/workitem/t3team-WorkItemIssueRow";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { resolveWorkItemStatusTone } from "~/t3team/workitem/t3team-workItemFieldTokens";

/** Done/total arithmetic behind the "N of M done" affordance, kept pure so it is directly testable. */
export function countWorkItemChildrenDone(children: ReadonlyArray<ProjectTicket>): {
  readonly done: number;
  readonly total: number;
} {
  const done = children.filter(
    (child) => resolveWorkItemStatusTone({ statusName: child.status }) === "done",
  ).length;
  return { done, total: children.length };
}

function WorkItemChildrenProgress({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {done} of {total} done
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", percent > 0 && "bg-success")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Child issues, with a "N of M done" progress affordance native Jira doesn't offer — derived from
 * each child's status category so it stays accurate across any workflow's own status names.
 */
export function WorkItemChildren({
  items,
  onOpenTicket,
}: {
  /** Named `items`, not `children`: these are child work items, not this component's React children. */
  readonly items: ReadonlyArray<ProjectTicket>;
  readonly onOpenTicket?: (ticketId: string) => void;
}) {
  if (items.length === 0) return null;

  const { done, total } = countWorkItemChildrenDone(items);

  return (
    <WorkItemSection
      title="Child items"
      count={items.length}
      action={<WorkItemChildrenProgress done={done} total={total} />}
    >
      <WorkItemIssueList>
        {items.map((child) => (
          <WorkItemIssueRow
            key={child.id}
            ticket={child}
            {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
          />
        ))}
      </WorkItemIssueList>
    </WorkItemSection>
  );
}
