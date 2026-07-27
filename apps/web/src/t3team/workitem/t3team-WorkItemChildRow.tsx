import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { updateProjectBacklogEstimateRemote } from "~/t3team/hooks/t3team-projectBacklogRemote";
import { ProjectBacklogRowEstimateCell } from "~/t3team/t3team-ProjectBacklogRowPlanningCells";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemChildAssigneeControl } from "~/t3team/workitem/t3team-WorkItemChildAssigneeControl";
import { WorkItemIssueRow } from "~/t3team/workitem/t3team-WorkItemIssueRow";

/**
 * One child row, wired with its own assignee and estimate pickers when the section can write.
 *
 * Split out of `WorkItemChildren` so that component's `.map()` stays one line per child instead of
 * two inline conditional blocks (one per picker) growing that file past its line budget.
 */
export function WorkItemChildRow({
  child,
  currentUserName,
  onOpenTicket,
  canWrite,
  backend,
  accountId,
  estimateFieldLabel,
  onReload,
}: {
  readonly child: ProjectTicket;
  readonly currentUserName?: string | undefined;
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined;
  readonly canWrite: boolean;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  /**
   * The project's story-point field label, as the backlog resolves it. Without it the cell can
   * only offer an estimate on hour-tracked issues; leaving it undefined is the honest state, not
   * a reason to invent a unit.
   */
  readonly estimateFieldLabel?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  return (
    <WorkItemIssueRow
      {...(currentUserName ? { currentUserName } : {})}
      ticket={child}
      {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
      {...(canWrite
        ? {
            /*
              The backlog's own estimate cell, used unchanged.

              It already resolves hours versus story points from the project's Jira configuration,
              prints the matching unit, owns its draft/saving/error state, and goes read-only when
              Jira says the field is not editable. A work-item-specific estimate control was a second
              copy of all that — and a worse one: it hardcoded "Story points", so an hours project
              was asked for points.
            */
            estimateControl: (
              <ProjectBacklogRowEstimateCell
                ticket={child}
                compact
                quiet
                {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
                /*
                  The backlog's own write, not a hand-rolled `updateIssueEstimate` call. It derives
                  `estimateMode` from the ticket — hours for time-tracked issues, points otherwise —
                  and omitting that wrote an hours estimate into the story-points field, which Jira
                  rejected. The mode is not something a call site should re-derive.
                */
                onUpdateEstimate={async (target, estimateValue) => {
                  await updateProjectBacklogEstimateRemote({
                    backend: backend!,
                    accountId: accountId!,
                    ticket: target,
                    estimateValue,
                  });
                  onReload!();
                }}
              />
            ),
            assigneeControl: (
              <WorkItemChildAssigneeControl
                child={child}
                backend={backend!}
                accountId={accountId!}
                {...(currentUserName ? { currentUserName } : {})}
                onReload={onReload!}
              />
            ),
          }
        : {})}
    />
  );
}
