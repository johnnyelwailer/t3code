import { Plus } from "lucide-react";
import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemChildCreateForm } from "~/t3team/workitem/t3team-WorkItemChildCreateForm";
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
  currentUserName,
  onContextMenu,
  anchorId,
  items,
  onOpenTicket,
  backend,
  accountId,
  projectId,
  issueIdOrKey,
  onReload,
}: {
  /** Section nav target. */
  readonly anchorId?: string | undefined;
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  readonly currentUserName?: string | undefined;
  /** Named `items`, not `children`: these are child work items, not this component's React children. */
  readonly items: ReadonlyArray<ProjectTicket>;
  readonly onOpenTicket?: (ticketId: string) => void;
  /** Present only with a live Atlassian connection — absent, the section stays read-only. */
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly issueIdOrKey?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  const [creating, setCreating] = useState(false);
  const canWrite = Boolean(backend && accountId && projectId && issueIdOrKey && onReload);
  if (items.length === 0 && !canWrite) return null;

  const { done, total } = countWorkItemChildrenDone(items);

  return (
    <WorkItemSection
      {...(anchorId ? { anchorId } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      title="Child items"
      count={items.length}
      action={
        <div className="flex items-center gap-2">
          {items.length > 0 ? <WorkItemChildrenProgress done={done} total={total} /> : null}
          {canWrite ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              Add child
            </Button>
          ) : null}
        </div>
      }
    >
      {creating ? (
        <div className="mb-3">
          <WorkItemChildCreateForm
            backend={backend!}
            accountId={accountId!}
            projectId={projectId!}
            parentIssueIdOrKey={issueIdOrKey!}
            onReload={onReload!}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : null}
      {items.length > 0 ? (
        <WorkItemIssueList>
          {items.map((child) => (
            <WorkItemIssueRow
              {...(currentUserName ? { currentUserName } : {})}
              key={child.id}
              ticket={child}
              {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
            />
          ))}
        </WorkItemIssueList>
      ) : null}
    </WorkItemSection>
  );
}
