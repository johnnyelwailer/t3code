import { toRelationshipTicket } from "~/t3team/t3team-ticketRelationships-helpers";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemIssueList, WorkItemIssueRow } from "~/t3team/workitem/t3team-WorkItemIssueRow";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { groupWorkItemIssueLinks } from "~/t3team/workitem/t3team-workItemLinkGroups";

function findProjectTicket(
  projectTickets: ReadonlyArray<ProjectTicket>,
  key: string,
): ProjectTicket | undefined {
  return projectTickets.find(
    (candidate) =>
      candidate.id === key || candidate.ref.displayId === key || candidate.ref.id === key,
  );
}

/**
 * Linked issues, grouped by Jira's own link type label rather than flattened into one list — a
 * "blocks" group and a "relates to" group are different kinds of information and should not read
 * as one undifferentiated pile. Each row still carries its group's `relationLabel`, matching how
 * `WorkItemIssueRow` already renders it for children.
 */
export function WorkItemLinks({
  currentUserName,
  onContextMenu,
  anchorId,
  snapshotRaw,
  projectTickets,
  projectId,
  onOpenTicket,
}: {
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  readonly currentUserName?: string | undefined;
  /** Section nav target. */
  readonly anchorId?: string | undefined;
  readonly snapshotRaw: unknown;
  readonly projectTickets: ReadonlyArray<ProjectTicket>;
  readonly projectId: string;
  readonly onOpenTicket?: (ticketId: string) => void;
}) {
  const groups = groupWorkItemIssueLinks(snapshotRaw, (key) =>
    findProjectTicket(projectTickets, key),
  );
  const total = groups.reduce((sum, group) => sum + group.issues.length, 0);
  if (total === 0) return null;

  return (
    <WorkItemSection
      title="Linked issues"
      {...(anchorId ? { anchorId } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      count={total}
    >
      <div className="space-y-3">
        {groups.map((group) => (
          <WorkItemIssueList key={group.label}>
            {group.issues.map((issue) => (
              <WorkItemIssueRow
                {...(currentUserName ? { currentUserName } : {})}
                key={issue.key}
                ticket={issue.ticket ?? toRelationshipTicket({ key: issue.key }, projectId)}
                relationLabel={group.label}
                {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
              />
            ))}
          </WorkItemIssueList>
        ))}
      </div>
    </WorkItemSection>
  );
}
