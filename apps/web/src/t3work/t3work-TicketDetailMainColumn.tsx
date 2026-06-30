import { Loader2 } from "lucide-react";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { TicketMetadata } from "~/t3work/components/ticket/t3work-TicketMetadata";
import { TicketRichContent } from "~/t3work/components/ticket/t3work-TicketRichContent";
import { buildTicketRelationships } from "~/t3work/t3work-ticketRelationships-helpers";
import { TicketParentSummary, TicketRelatedLinks } from "~/t3work/t3work-TicketRelationships";
import { useBackend } from "~/t3work/backend/t3work-index";
import { useAgentContext } from "~/t3work/hooks/t3work-useAgentContext";
import { TicketDetailGitHubSection } from "~/t3work/t3work-TicketDetailGitHubSection";
import type { TicketDetailMainColumnProps } from "~/t3work/t3work-TicketDetailMainColumn.types";
import { TicketDetailDraftDocumentReview } from "~/t3work/t3work-TicketDetailDraftDocumentReview";
import {
  buildParentContextMenuData,
  createSectionContextMenuHandler,
  createReferenceContextMenuHandler,
  normalizeTicketAttachments,
  normalizeTicketComments,
} from "~/t3work/t3work-ticketDetailMainColumn.helpers";

export function TicketDetailMainColumn({
  snapshot,
  displayId,
  title: _title,
  status,
  priority,
  assignee,
  projectId,
  project,
  projectTickets,
  ticketId,
  ticketParentId,
  snapshotParentId,
  snapshotRaw,
  onOpenTicket,
  loading,
  error,
  descriptionMarkdown,
  descriptionHtml,
  htmlBaseUrl,
  attachments,
  sortedComments,
  jiraLastCheckedAt,
  githubActivityItems,
  githubActivityLastCheckedAt,
  githubActivityLoading,
  githubActivityWarning,
  githubHost,
  githubAccount,
}: TicketDetailMainColumnProps) {
  const backend = useBackend();
  const { showAgentContextMenu } = useAgentContext();
  const ticket = projectTickets.find((candidate) => candidate.id === ticketId);
  const relationshipData = buildTicketRelationships({
    projectTickets,
    ticketId,
    displayId,
    ticketParentId,
    snapshotParentId,
    snapshotRaw,
  });
  const handleSectionContextMenu = createSectionContextMenuHandler({
    backend: backend ?? undefined,
    ticket,
    projectId,
    project,
    projectTickets,
    githubActivityItems,
    snapshot,
    showAgentContextMenu,
  });
  const parentContextMenuData = buildParentContextMenuData({
    displayId,
    parentEntry: relationshipData.parentEntry,
  });
  const handleReferenceContextMenu = createReferenceContextMenuHandler({
    handleSectionContextMenu,
    projectId,
    ticketId,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-3 py-4 sm:px-5">
      <div
        onContextMenu={(event) =>
          handleSectionContextMenu(event, "metadata", `${displayId} metadata`, [
            { label: "Status", value: status },
            ...(priority ? [{ label: "Priority", value: priority }] : []),
            ...(assignee ? [{ label: "Assignee", value: assignee }] : []),
          ])
        }
      >
        <TicketMetadata snapshot={snapshot} priority={priority} assignee={assignee} />
      </div>

      <div
        onContextMenu={(event) =>
          handleSectionContextMenu(
            event,
            "parent",
            parentContextMenuData.label,
            parentContextMenuData.summaryItems,
            {
              kind: parentContextMenuData.kind,
              ...(parentContextMenuData.jiraIssueType
                ? { jiraIssueType: parentContextMenuData.jiraIssueType }
                : {}),
              ...(parentContextMenuData.jiraIssueTypeIconUrl
                ? { jiraIssueTypeIconUrl: parentContextMenuData.jiraIssueTypeIconUrl }
                : {}),
            },
          )
        }
      >
        <TicketParentSummary
          projectId={projectId}
          {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
          onOpenTicket={onOpenTicket}
          parentEntry={relationshipData.parentEntry}
        />
      </div>

      <TicketDetailGitHubSection
        {...(backend ? { backend } : {})}
        project={project}
        {...(ticket ? { ticket } : {})}
        projectTickets={projectTickets}
        displayId={displayId}
        githubActivityItems={githubActivityItems}
        {...(githubActivityLastCheckedAt !== undefined ? { githubActivityLastCheckedAt } : {})}
        {...(githubActivityLoading ? { githubActivityLoading } : {})}
        {...(githubActivityWarning ? { githubActivityWarning } : {})}
        {...(githubHost ? { githubHost } : {})}
        {...(githubAccount ? { githubAccount } : {})}
      />

      <TicketDetailDraftDocumentReview
        projectId={projectId}
        issueIdOrKey={displayId}
        {...(descriptionMarkdown ? { descriptionMarkdown } : {})}
        {...(descriptionHtml ? { descriptionHtml } : {})}
        {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
      />

      {loading ? (
        <T3SurfaceCard>
          <T3SurfaceCardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading ticket details...
          </T3SurfaceCardContent>
        </T3SurfaceCard>
      ) : null}

      {error ? (
        <T3SurfaceCard tone="danger">
          <T3SurfaceCardContent className="text-sm text-destructive">{error}</T3SurfaceCardContent>
        </T3SurfaceCard>
      ) : null}

      <TicketRichContent
        {...(descriptionMarkdown ? { descriptionMarkdown } : {})}
        {...(descriptionHtml ? { descriptionHtml } : {})}
        {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
        projectId={projectId}
        ticketKey={displayId}
        {...(project.source.accountId ? { accountId: project.source.accountId } : {})}
        {...(backend?.httpBaseUrl ? { httpBaseUrl: backend.httpBaseUrl } : {})}
        {...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {})}
        onDescriptionContextMenu={(event) =>
          handleSectionContextMenu(event, "description", `${displayId} description`, [
            {
              label: "Description source",
              value: descriptionHtml ? "HTML" : "Markdown",
            },
          ])
        }
        onAttachmentsContextMenu={(event) =>
          handleSectionContextMenu(event, "attachments", `${displayId} attachments`, [
            { label: "Attachment count", value: String(attachments.length) },
          ])
        }
        onCommentsContextMenu={(event) =>
          handleSectionContextMenu(event, "comments", `${displayId} comments`, [
            { label: "Comment count", value: String(sortedComments.length) },
          ])
        }
        afterDescription={
          <div>
            <TicketRelatedLinks
              projectId={projectId}
              {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
              onOpenTicket={onOpenTicket}
              childEntries={relationshipData.childEntries}
              referencedEntries={relationshipData.referencedEntries}
              onReferenceContextMenu={handleReferenceContextMenu}
            />
          </div>
        }
        attachments={normalizeTicketAttachments(attachments)}
        comments={normalizeTicketComments(sortedComments)}
      />
    </div>
  );
}
