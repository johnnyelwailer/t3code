import { Loader2 } from "lucide-react";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { TicketMetadata } from "~/t3work/components/ticket/t3work-TicketMetadata";
import { TicketRichContent } from "~/t3work/components/ticket/t3work-TicketRichContent";
import { buildTicketRelationships } from "~/t3work/t3work-ticketRelationships-helpers";
import { TicketParentSummary, TicketRelatedLinks } from "~/t3work/t3work-TicketRelationships";
import { useBackend } from "~/t3work/backend/t3work-index";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { TicketDetailGitHubSection } from "~/t3work/t3work-TicketDetailGitHubSection";
import type { TicketDetailMainColumnProps } from "~/t3work/t3work-TicketDetailMainColumn.types";
import {
  createSectionContextMenuHandler,
  normalizeTicketAttachments,
  normalizeTicketComments,
} from "~/t3work/t3work-ticketDetailMainColumn.helpers";

export function TicketDetailMainColumn({
  snapshot,
  displayId,
  title,
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
  githubActivityItems,
  githubActivityLoading,
  githubActivityWarning,
  githubHost,
  githubAccount,
}: TicketDetailMainColumnProps) {
  const backend = useBackend();
  const { showAddToChatContextMenu } = useAddToChat();
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
    showAddToChatContextMenu,
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
          handleSectionContextMenu(event, "parent", `${displayId} parent`, [
            {
              label: "Has parent",
              value: relationshipData.parentEntry ? "Yes" : "No",
            },
          ])
        }
      >
        <TicketParentSummary
          projectId={projectId}
          onOpenTicket={onOpenTicket}
          parentEntry={relationshipData.parentEntry}
        />
      </div>

      <TicketDetailGitHubSection
        projectId={projectId}
        projectTitle={project.title}
        {...(project.workspace?.rootPath
          ? { projectWorkspaceRoot: project.workspace.rootPath }
          : {})}
        {...(backend ? { backend } : {})}
        project={project}
        {...(ticket ? { ticket } : {})}
        projectTickets={projectTickets}
        displayId={displayId}
        githubActivityItems={githubActivityItems}
        showAddToChatContextMenu={showAddToChatContextMenu}
        {...(githubActivityLoading ? { githubActivityLoading } : {})}
        {...(githubActivityWarning ? { githubActivityWarning } : {})}
        {...(githubHost ? { githubHost } : {})}
        {...(githubAccount ? { githubAccount } : {})}
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
          <div
            onContextMenu={(event) =>
              handleSectionContextMenu(event, "relationships", `${displayId} relationships`, [
                { label: "Child links", value: String(relationshipData.childEntries.length) },
                {
                  label: "Reference links",
                  value: String(relationshipData.referencedEntries.length),
                },
              ])
            }
          >
            <TicketRelatedLinks
              projectId={projectId}
              onOpenTicket={onOpenTicket}
              childEntries={relationshipData.childEntries}
              referencedEntries={relationshipData.referencedEntries}
            />
          </div>
        }
        attachments={normalizeTicketAttachments(attachments)}
        comments={normalizeTicketComments(sortedComments)}
      />
    </div>
  );
}
