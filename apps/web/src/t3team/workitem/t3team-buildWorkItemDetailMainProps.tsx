import type { ProjectShellProject } from "@t3tools/project-context";

import type { useWorkItemDetailViewModel } from "~/t3team/hooks/t3team-useWorkItemDetailViewModel";
import { TicketDetailDraftDocumentReview } from "~/t3team/t3team-TicketDetailDraftDocumentReview";
import { TicketDetailGitHubSection } from "~/t3team/t3team-TicketDetailGitHubSection";
import { buildTicketRelationships } from "~/t3team/t3team-ticketRelationships-helpers";
import {
  createSectionContextMenuHandler,
  normalizeTicketAttachments,
  normalizeTicketComments,
} from "~/t3team/t3team-ticketDetailMainColumn.helpers";
import type { WorkItemDetailMainProps } from "~/t3team/workitem/t3team-WorkItemDetailMain";

type WorkItemDetailView = ReturnType<typeof useWorkItemDetailViewModel>;

/**
 * Adapts the resolved view model to the content column's props.
 *
 * Kept separate from the route component so the route stays composition-only, and so the mapping —
 * which is where the old and new data shapes meet — is testable on its own.
 */
export function buildWorkItemDetailMainProps({
  view,
  project,
  onOpenTicket,
  showAgentContextMenu,
}: {
  readonly view: WorkItemDetailView;
  readonly project: ProjectShellProject;
  readonly onOpenTicket: (ticketId: string) => void;
  readonly showAgentContextMenu: Parameters<
    typeof createSectionContextMenuHandler
  >[0]["showAgentContextMenu"];
}): WorkItemDetailMainProps {
  const resolvedTicketId = view.ticket?.id ?? view.canonicalTicketId;

  const relationships = buildTicketRelationships({
    projectTickets: view.ticketsWithRelated,
    ticketId: resolvedTicketId,
    displayId: view.displayId,
    ticketParentId: view.ticket?.parentId,
    snapshotParentId: view.snapshot?.ref.parentId,
    snapshotRaw: view.snapshot?.raw,
  });

  /** Children we have real data for. A bare key with no ticket has nothing worth showing in a row. */
  const childItems = relationships.childEntries
    .map((entry) => entry.ticket)
    .filter((child) => child !== undefined);

  /**
   * Right-clicking a section hands it to the agent. This existed on every section of the previous
   * view and was lost when that component was replaced; the handler itself never went away, so this
   * reconnects it rather than reinventing it.
   */
  const handleSectionContextMenu = createSectionContextMenuHandler({
    backend: view.backend ?? undefined,
    ...(view.ticket ? { ticket: view.ticket } : { ticket: undefined }),
    projectId: project.id,
    project,
    projectTickets: view.ticketsWithRelated,
    githubActivityItems: view.matchedGitHubActivityItems,
    snapshot: view.snapshot,
    showAgentContextMenu,
  });

  const hasGitHubActivity =
    view.matchedGitHubActivityItems.length > 0 || Boolean(view.githubActivity.warning);

  return {
    model: view.fieldModel,
    ...(view.currentUserName ? { currentUserName: view.currentUserName } : {}),
    onSectionContextMenu: (event, section, label) =>
      handleSectionContextMenu(event, section, label),
    projectId: project.id,
    ...(project.source.accountId ? { accountId: project.source.accountId } : {}),
    ...(view.backend ? { backend: view.backend.atlassian } : {}),
    ...(project.source.externalProjectId
      ? { externalProjectId: project.source.externalProjectId }
      : {}),
    ...(view.backend?.httpBaseUrl ? { httpBaseUrl: view.backend.httpBaseUrl } : {}),
    ...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {}),
    ...(view.htmlBaseUrl ? { htmlBaseUrl: view.htmlBaseUrl } : {}),
    childItems,
    projectTickets: view.ticketsWithRelated,
    snapshotRaw: view.snapshot?.raw,
    attachments: normalizeTicketAttachments(view.attachments),
    comments: normalizeTicketComments(view.sortedComments),
    nowMs: Date.now(),
    loading: view.loading,
    error: view.error,
    onReload: () => void view.reload(),
    onOpenTicket,
    supplementalSections: (
      <>
        {/*
          Only rendered when there is activity or a warning explaining its absence. An empty panel
          saying "No GitHub activity matched yet" is a section whose entire content is the news that
          it has no content — on most items that is permanent, so it was pure furniture.
        */}
        {hasGitHubActivity ? (
          <TicketDetailGitHubSection
            {...(view.backend ? { backend: view.backend } : {})}
            project={project}
            {...(view.ticket ? { ticket: view.ticket } : {})}
            projectTickets={view.ticketsWithRelated}
            displayId={view.displayId}
            githubActivityItems={view.matchedGitHubActivityItems}
            {...(view.githubActivity.lastCheckedAt !== undefined
              ? { githubActivityLastCheckedAt: view.githubActivity.lastCheckedAt }
              : {})}
            {...(view.githubActivity.loading ? { githubActivityLoading: true } : {})}
            {...(view.githubActivity.warning
              ? { githubActivityWarning: view.githubActivity.warning }
              : {})}
          />
        ) : null}

        <TicketDetailDraftDocumentReview
          projectId={project.id}
          issueIdOrKey={view.displayId}
          {...(view.descriptionMarkdown ? { descriptionMarkdown: view.descriptionMarkdown } : {})}
          {...(view.descriptionHtml ? { descriptionHtml: view.descriptionHtml } : {})}
          {...(view.htmlBaseUrl ? { htmlBaseUrl: view.htmlBaseUrl } : {})}
          {...(view.backend?.atlassian ? { backend: view.backend.atlassian } : {})}
          {...(project.source.accountId ? { accountId: project.source.accountId } : {})}
          onReload={() => void view.reload()}
        />
      </>
    ),
  };
}

export type { WorkItemDetailView };
