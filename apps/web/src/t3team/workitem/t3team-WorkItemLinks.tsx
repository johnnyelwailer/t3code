import { Plus } from "lucide-react";
import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { Button } from "~/t3team/components/ui/t3team-button";
import { toRelationshipTicket } from "~/t3team/t3team-ticketRelationships-helpers";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemIssueList } from "~/t3team/workitem/t3team-WorkItemIssueRow";
import { WorkItemLinkCreateForm } from "~/t3team/workitem/t3team-WorkItemLinkCreateForm";
import { WorkItemLinkRow } from "~/t3team/workitem/t3team-WorkItemLinkRow";
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
  backend,
  accountId,
  issueIdOrKey,
  onReload,
}: {
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  readonly currentUserName?: string | undefined;
  /** Section nav target. */
  readonly anchorId?: string | undefined;
  readonly snapshotRaw: unknown;
  readonly projectTickets: ReadonlyArray<ProjectTicket>;
  readonly projectId: string;
  readonly onOpenTicket?: (ticketId: string) => void;
  /** Present only with a live Atlassian connection — absent, the section stays read-only. */
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly issueIdOrKey?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  const [creating, setCreating] = useState(false);
  const groups = groupWorkItemIssueLinks(snapshotRaw, (key) =>
    findProjectTicket(projectTickets, key),
  );
  const total = groups.reduce((sum, group) => sum + group.issues.length, 0);
  const canWrite = Boolean(backend && accountId && issueIdOrKey && onReload);
  if (total === 0 && !canWrite) return null;

  return (
    <WorkItemSection
      title="Linked issues"
      {...(anchorId ? { anchorId } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      count={total}
      {...(canWrite
        ? {
            action: (
              <Button type="button" variant="ghost" size="xs" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                Add link
              </Button>
            ),
          }
        : {})}
    >
      <div className="space-y-3">
        {creating ? (
          <WorkItemLinkCreateForm
            backend={backend!}
            accountId={accountId!}
            issueIdOrKey={issueIdOrKey!}
            onReload={onReload!}
            onDone={() => setCreating(false)}
          />
        ) : null}

        {groups.map((group) => (
          <WorkItemIssueList key={group.label}>
            {group.issues.map((issue) => (
              <WorkItemLinkRow
                key={issue.key}
                issueIdOrKey={issueIdOrKey ?? ""}
                linkId={issue.linkId}
                linkTypeName={issue.linkTypeName ?? group.label}
                direction={issue.direction ?? "outward"}
                otherIssueIdOrKey={issue.key}
                {...(currentUserName ? { currentUserName } : {})}
                ticket={issue.ticket ?? toRelationshipTicket({ key: issue.key }, projectId)}
                relationLabel={group.label}
                {...(backend ? { backend } : {})}
                {...(accountId ? { accountId } : {})}
                {...(onReload ? { onReload } : {})}
                {...(onOpenTicket ? { onOpen: onOpenTicket } : {})}
              />
            ))}
          </WorkItemIssueList>
        ))}
      </div>
    </WorkItemSection>
  );
}
