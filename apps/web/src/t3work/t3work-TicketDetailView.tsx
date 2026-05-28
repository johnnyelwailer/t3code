import { useCallback, useMemo } from "react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useBackend, useBackendState } from "~/t3work/backend/t3work-index";
import {
  readIssueTypeFromSnapshotFields,
  readIssueTypeIconUrlFromSnapshotFields,
} from "~/t3work/components/ticket/t3work-JiraIssueType";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import { useProjectResources } from "~/t3work/hooks/t3work-useProjectResources";
import { useRelatedTickets } from "~/t3work/hooks/t3work-useRelatedTickets";
import { useTicketDetail } from "~/t3work/hooks/t3work-useTicketDetail";
import type { TicketKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import { TicketDetailBody } from "~/t3work/t3work-TicketDetailBody";
import { TicketDetailHeader } from "~/t3work/t3work-TicketDetailHeader";
import {
  buildTicketDetailKickoffAsideProps,
  buildTicketDetailMainColumnProps,
} from "~/t3work/t3work-TicketDetailViewProps";
import { navigateBackWithFallback } from "~/t3work/t3work-historyBack";
import {
  asRecordArray,
  resolveHtmlBaseUrl,
  sortCommentItems,
} from "~/t3work/t3work-ticketDetailUtils";
import { extractRelationshipKeys } from "~/t3work/t3work-ticketRelationshipKeys";
import {
  buildProjectTicketLookup,
  resolveCanonicalProjectTicketId,
} from "~/t3work/t3work-ticketLookup";
import type { ProjectThread } from "~/t3work/t3work-types";
import { useTicketDetailEmbeddedThreadEffects } from "~/t3work/t3work-useTicketDetailEmbeddedThreadEffects";

export function TicketDetailView({
  project,
  ticketId,
  shouldInsetDesktopHeader = false,
  activeThreadId,
  projectThreads,
  onOpenTicket,
  onOpenThread,
  onOpenFullThread,
  onKickoffThread,
  onThreadKickoffConsumed,
  onRememberEmbeddedThread,
  onBack,
}: {
  project: ProjectShellProject;
  ticketId: string;
  shouldInsetDesktopHeader?: boolean;
  activeThreadId?: string;
  projectThreads: ProjectThread[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onKickoffThread: (input: TicketKickoffThreadInput) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberEmbeddedThread: (threadId: string) => void;
  onBack: () => void;
}) {
  const backend = useBackend();
  const backendState = useBackendState();
  const { addToChatFromRequest } = useAddToChat();
  const canGoBack = useCanGoBack();
  const { tickets: projectTickets, lastCheckedAt: jiraLastCheckedAt } =
    useProjectResources(project);
  const ticketLookup = useMemo(() => buildProjectTicketLookup(projectTickets), [projectTickets]);
  const canonicalTicketId = resolveCanonicalProjectTicketId(ticketId, ticketLookup) ?? ticketId;
  const ticket = ticketLookup.get(ticketId);
  const resourceId = ticket?.ref.id ?? canonicalTicketId;
  const { snapshot, loading, error, reload } = useTicketDetail(project, resourceId);
  const issueType =
    ticket?.issueType ?? ticket?.ref.type ?? readIssueTypeFromSnapshotFields(snapshot?.fields);
  const issueTypeIconUrl =
    ticket?.issueTypeIconUrl ??
    ticket?.ref.issueTypeIconUrl ??
    readIssueTypeIconUrlFromSnapshotFields(snapshot?.fields);
  const displayId = ticket?.ref.displayId ?? snapshot?.ref.displayId ?? ticketId;
  const title = ticket?.ref.title ?? snapshot?.ref.title ?? "Ticket";
  const { relatedTickets, ticketsWithRelated } = useRelatedTickets({
    project,
    snapshot,
    projectTickets,
    currentTicketId: ticket?.id ?? ticketId,
    currentDisplayId: displayId,
  });
  const relationshipKeys = useMemo(() => extractRelationshipKeys(snapshot?.raw), [snapshot?.raw]);
  const status = ticket?.status ?? (snapshot?.fields.status as string | undefined) ?? "Unknown";
  const priority =
    ticket?.priority ?? (snapshot?.fields.priority as string | undefined) ?? undefined;
  const assignee =
    ticket?.assignee ?? (snapshot?.fields.assignee as string | undefined) ?? undefined;
  const ticketUrl = ticket?.ref.url || snapshot?.ref.url || undefined;
  const htmlBaseUrl = useMemo(() => resolveHtmlBaseUrl(ticketUrl), [ticketUrl]);
  const descriptionMarkdown =
    (snapshot?.fields.description as string | undefined) ?? snapshot?.text;
  const descriptionHtml = snapshot?.fields.descriptionHtml as string | undefined;
  const attachments = asRecordArray(snapshot?.fields.attachments);
  const sortedComments = useMemo(
    () => sortCommentItems(asRecordArray(snapshot?.fields.commentItems)),
    [snapshot?.fields.commentItems],
  );
  const issueThreads = projectThreads.filter(
    (thread) =>
      resolveCanonicalProjectTicketId(thread.ticketId, ticketLookup) === canonicalTicketId,
  );
  const activeThread = activeThreadId
    ? (projectThreads.find((candidate) => candidate.id === activeThreadId) ?? null)
    : null;
  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls: readLinkedRepositoryUrlsFromProject(project),
    enabled: true,
  });
  const matchedGitHubActivityItems = githubActivity.activityByWorkItem.get(displayId) ?? [];

  useTicketDetailEmbeddedThreadEffects({
    activeThread,
    addToChatFromRequest,
    backend,
    githubActivityItems: matchedGitHubActivityItems,
    onRememberEmbeddedThread,
    project,
    projectTickets,
    ticket,
  });

  const handleBack = useCallback(() => {
    navigateBackWithFallback({ canGoBack, onFallback: onBack });
  }, [canGoBack, onBack]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TicketDetailHeader
        displayId={displayId}
        status={status}
        title={title}
        issueType={issueType}
        issueTypeIconUrl={issueTypeIconUrl}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
        onBack={handleBack}
        onReload={() => void reload()}
        ticketUrl={ticketUrl}
      />

      <TicketDetailBody
        projectId={project.id}
        ticketId={ticketId}
        activeThreadId={activeThreadId}
        mainColumnProps={buildTicketDetailMainColumnProps({
          snapshot,
          displayId,
          title,
          status,
          priority,
          assignee,
          project,
          projectTickets: ticketsWithRelated,
          resolvedTicketId: ticket?.id ?? canonicalTicketId,
          ticketParentId: ticket?.parentId,
          loading,
          error,
          descriptionMarkdown,
          descriptionHtml,
          htmlBaseUrl,
          attachments,
          sortedComments,
          jiraLastCheckedAt,
          matchedGitHubActivityItems,
          githubActivity,
          onOpenTicket,
        })}
        kickoffAsideProps={buildTicketDetailKickoffAsideProps({
          project,
          displayId,
          title,
          ticket,
          status,
          relationshipKeys,
          relatedTickets,
          issueType,
          priority,
          issueThreads,
          resolvedTicketId: ticket?.id ?? canonicalTicketId,
          activeThread,
          matchedGitHubActivityItems,
          backendState,
          onOpenThread,
          onOpenFullThread,
          onThreadKickoffConsumed,
          onKickoffThread,
        })}
      />
    </div>
  );
}
