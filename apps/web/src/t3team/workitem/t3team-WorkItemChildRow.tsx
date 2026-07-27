import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemChildAssigneeControl } from "~/t3team/workitem/t3team-WorkItemChildAssigneeControl";
import { WorkItemChildEstimateControl } from "~/t3team/workitem/t3team-WorkItemChildEstimateControl";
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
  onReload,
}: {
  readonly child: ProjectTicket;
  readonly currentUserName?: string | undefined;
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined;
  readonly canWrite: boolean;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  return (
    <WorkItemIssueRow
      {...(currentUserName ? { currentUserName } : {})}
      ticket={child}
      {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
      {...(canWrite
        ? {
            estimateControl: (
              <WorkItemChildEstimateControl
                child={child}
                backend={backend!}
                accountId={accountId!}
                onReload={onReload!}
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
