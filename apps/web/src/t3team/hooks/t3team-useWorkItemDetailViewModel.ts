import { useEffect, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend, useBackendState } from "~/t3team/backend/t3team-index";
import {
  readIssueTypeFromSnapshotFields,
  readIssueTypeIconUrlFromSnapshotFields,
} from "~/t3team/components/ticket/t3team-JiraIssueType";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useAddToChat } from "~/t3team/hooks/t3team-useAddToChat";
import { useAtlassianCurrentUserDisplayName } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { useProjectGitHubActivity } from "~/t3team/hooks/t3team-useProjectGitHubActivity";
import { useProjectIssues } from "~/t3team/hooks/t3team-useProjectIssues";
import { useRelatedTickets } from "~/t3team/hooks/t3team-useRelatedTickets";
import { useTicketDetail } from "~/t3team/hooks/t3team-useTicketDetail";
import { drainQueuedWorkItemContextSyncRequests } from "~/t3team/hooks/t3team-useWorkItemContextSyncQueue";
import { proxyAtlassianAssetUrl } from "~/t3team/t3team-atlassianAssetUrls";
import {
  asRecordArray,
  resolveHtmlBaseUrl,
  sortCommentItems,
} from "~/t3team/t3team-ticketDetailUtils";
import {
  buildProjectTicketLookup,
  resolveCanonicalProjectTicketId,
} from "~/t3team/t3team-ticketLookup";
import { extractRelationshipKeys } from "~/t3team/t3team-ticketRelationshipKeys";
import type { ProjectThread } from "~/t3team/t3team-types";
import { useTicketDetailEmbeddedThreadEffects } from "~/t3team/t3team-useTicketDetailEmbeddedThreadEffects";
import { readWorkItemFieldModel } from "~/t3team/workitem/t3team-workItemSnapshotFields";

/**
 * Everything the work item detail view needs to render, resolved in one place.
 *
 * The view was carrying all of this inline and had grown past the module size limit. Splitting the
 * data resolution out is also the shape the project asks for — a controller hook plus presentational
 * components — and it makes the view itself readable as pure composition.
 */
export function useWorkItemDetailViewModel({
  project,
  ticketId,
  activeThreadId,
  projectThreads,
  onRememberEmbeddedThread,
}: {
  readonly project: ProjectShellProject;
  readonly ticketId: string;
  readonly activeThreadId?: string | undefined;
  readonly projectThreads: ProjectThread[];
  readonly onRememberEmbeddedThread: (threadId: string) => void;
}) {
  const backend = useBackend();
  const backendState = useBackendState();
  const { addToChatFromRequest } = useAddToChat();
  // Whole project, not My Work: children/parents/links are routinely assigned
  // to somebody else, so `assignee = currentUser()` can never resolve them.
  const {
    tickets: projectTickets,
    estimateFieldLabel,
    lastCheckedAt: jiraLastCheckedAt,
  } = useProjectIssues(project);
  const currentUserName = useAtlassianCurrentUserDisplayName(project.source.accountId);
  const accountId = project.source.accountId;

  const ticketLookup = useMemo(() => buildProjectTicketLookup(projectTickets), [projectTickets]);
  const canonicalTicketId = resolveCanonicalProjectTicketId(ticketId, ticketLookup) ?? ticketId;
  const ticket = ticketLookup.get(ticketId);
  const resourceId = ticket?.ref.id ?? canonicalTicketId;
  const { snapshot, loading, error, reload } = useTicketDetail(project, resourceId);

  const displayId = ticket?.ref.displayId ?? snapshot?.ref.displayId ?? ticketId;
  const title = ticket?.ref.title ?? snapshot?.ref.title ?? "Ticket";
  const status = ticket?.status ?? (snapshot?.fields.status as string | undefined) ?? "Unknown";
  const priority = ticket?.priority ?? (snapshot?.fields.priority as string | undefined);
  const assignee = ticket?.assignee ?? (snapshot?.fields.assignee as string | undefined);
  const ticketUrl = ticket?.ref.url || snapshot?.ref.url || undefined;

  const fieldModel = useMemo(
    () =>
      readWorkItemFieldModel({
        snapshot,
        ...(ticket ? { ticket } : {}),
        fallbackKey: displayId,
        accountId,
      }),
    [accountId, displayId, snapshot, ticket],
  );

  const { relatedTickets, ticketsWithRelated } = useRelatedTickets({
    project,
    snapshot,
    projectTickets,
    currentTicketId: ticket?.id ?? ticketId,
    currentDisplayId: displayId,
  });
  const relationshipKeys = useMemo(() => extractRelationshipKeys(snapshot?.raw), [snapshot?.raw]);

  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls: readLinkedRepositoryUrlsFromProject(project),
    enabled: true,
  });
  const matchedGitHubActivityItems = githubActivity.activityByWorkItem.get(displayId) ?? [];

  const issueThreads = projectThreads.filter(
    (thread) =>
      resolveCanonicalProjectTicketId(thread.ticketId, ticketLookup) === canonicalTicketId,
  );
  const activeThread = activeThreadId
    ? (projectThreads.find((candidate) => candidate.id === activeThreadId) ?? null)
    : null;

  useEffect(() => {
    if (!backend || projectTickets.length === 0) return;

    void drainQueuedWorkItemContextSyncRequests({
      addToChatFromRequest,
      backend,
      project,
      projectTickets,
    });
  }, [addToChatFromRequest, backend, project, projectTickets]);

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

  return {
    backend,
    backendState,
    canonicalTicketId,
    ticket,
    snapshot,
    loading,
    error,
    reload,
    fieldModel,
    displayId,
    title,
    status,
    priority,
    assignee,
    ticketUrl,
    htmlBaseUrl: resolveHtmlBaseUrl(ticketUrl),
    issueType:
      ticket?.issueType ?? ticket?.ref.type ?? readIssueTypeFromSnapshotFields(snapshot?.fields),
    issueTypeIconUrl: proxyAtlassianAssetUrl({
      url:
        ticket?.issueTypeIconUrl ??
        ticket?.ref.issueTypeIconUrl ??
        readIssueTypeIconUrlFromSnapshotFields(snapshot?.fields),
      accountId,
    }),
    descriptionMarkdown: (snapshot?.fields.description as string | undefined) ?? snapshot?.text,
    descriptionHtml: snapshot?.fields.descriptionHtml as string | undefined,
    attachments: asRecordArray(snapshot?.fields.attachments),
    sortedComments: sortCommentItems(asRecordArray(snapshot?.fields.commentItems)),
    projectTickets,
    estimateFieldLabel,
    ticketsWithRelated,
    relatedTickets,
    relationshipKeys,
    jiraLastCheckedAt,
    githubActivity,
    matchedGitHubActivityItems,
    issueThreads,
    activeThread,
    currentUserName,
  };
}
