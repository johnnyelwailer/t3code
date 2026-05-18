import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { t3SurfaceBackdrops } from "~/t3work/components/ui/t3work-surface";
import { useBackendState } from "~/t3work/backend/t3work-index";
import {
  readIssueTypeFromSnapshotFields,
  readIssueTypeIconUrlFromSnapshotFields,
} from "~/t3work/components/ticket/t3work-JiraIssueType";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import { useProjectResources } from "~/t3work/hooks/t3work-useProjectResources";
import { useRelatedTickets } from "~/t3work/hooks/t3work-useRelatedTickets";
import { useTicketDetail } from "~/t3work/hooks/t3work-useTicketDetail";
import { buildTicketContextPrompt } from "~/t3work/t3work-AppTicketHelpers";
import { TicketDetailHeader } from "~/t3work/t3work-TicketDetailHeader";
import { TicketDetailKickoffAside } from "~/t3work/t3work-TicketDetailKickoffAside";
import { TicketDetailMainColumn } from "~/t3work/t3work-TicketDetailMainColumn";
import {
  asRecordArray,
  buildGithubActivitySummary,
  resolveHtmlBaseUrl,
  sortCommentItems,
} from "~/t3work/t3work-ticketDetailUtils";
import type { ProjectThread } from "~/t3work/t3work-types";

export function TicketDetailView({
  project,
  ticketId,
  projectThreads,
  onOpenTicket,
  onOpenThread,
  onKickoffThread,
  onBack,
}: {
  project: ProjectShellProject;
  ticketId: string;
  projectThreads: ProjectThread[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onKickoffThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
    kickoffMessage: string;
    kickoffModelSelection: ModelSelection;
    kickoffRuntimeMode: RuntimeMode;
    kickoffInteractionMode: ProviderInteractionMode;
  }) => void;
  onBack: () => void;
}) {
  const backendState = useBackendState();
  const { tickets: projectTickets } = useProjectResources(project);
  const ticket = projectTickets.find((candidate) => candidate.id === ticketId);
  const resourceId = ticket?.ref.id ?? ticketId;
  const { snapshot, loading, error, reload } = useTicketDetail(project, resourceId);
  const issueType =
    ticket?.issueType ?? ticket?.ref.type ?? readIssueTypeFromSnapshotFields(snapshot?.fields);
  const issueTypeIconUrl =
    ticket?.issueTypeIconUrl ??
    ticket?.ref.issueTypeIconUrl ??
    readIssueTypeIconUrlFromSnapshotFields(snapshot?.fields);
  const displayId = ticket?.ref.displayId ?? snapshot?.ref.displayId ?? ticketId;
  const title = ticket?.ref.title ?? snapshot?.ref.title ?? "Ticket";
  const { ticketsWithRelated } = useRelatedTickets({
    project,
    snapshot,
    projectTickets,
    currentTicketId: ticket?.id ?? ticketId,
    currentDisplayId: displayId,
  });
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
  const issueThreads = projectThreads.filter((thread) => thread.ticketId === ticketId);
  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls: readLinkedRepositoryUrlsFromProject(project),
    enabled: true,
  });
  const matchedGitHubActivityItems = useMemo(
    () => githubActivity.activityByWorkItem.get(displayId) ?? [],
    [displayId, githubActivity.activityByWorkItem],
  );
  const kickoffContext = useMemo(() => {
    const githubActivitySummary = buildGithubActivitySummary(matchedGitHubActivityItems);
    return buildTicketContextPrompt({
      projectTitle: project.title,
      displayId,
      title,
      status,
      ...(priority ? { priority } : {}),
      ...(assignee ? { assignee } : {}),
      ...(ticketUrl ? { ticketUrl } : {}),
      description: descriptionMarkdown ?? "",
      ...(githubActivitySummary ? { githubActivitySummary } : {}),
    });
  }, [
    project.title,
    displayId,
    title,
    status,
    priority,
    assignee,
    ticketUrl,
    descriptionMarkdown,
    matchedGitHubActivityItems,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TicketDetailHeader
        displayId={displayId}
        status={status}
        title={title}
        issueType={issueType}
        issueTypeIconUrl={issueTypeIconUrl}
        onBack={onBack}
        onReload={() => void reload()}
        ticketUrl={ticketUrl}
      />

      <div
        className={`grid min-h-0 flex-1 ${t3SurfaceBackdrops.ticketContent} lg:grid-cols-[minmax(0,1fr)_minmax(22rem,36%)]`}
      >
        <section
          className={`min-h-0 border-b border-border ${t3SurfaceBackdrops.ticketMainColumn} lg:border-r lg:border-b-0`}
        >
          <ScrollArea className="h-full">
            <TicketDetailMainColumn
              snapshot={snapshot}
              displayId={displayId}
              title={title}
              status={status}
              priority={priority}
              assignee={assignee}
              projectId={project.id}
              projectTickets={ticketsWithRelated}
              ticketId={ticket?.id ?? ticketId}
              ticketParentId={ticket?.parentId}
              snapshotParentId={
                typeof snapshot?.ref.parentId === "string" ? snapshot.ref.parentId : undefined
              }
              snapshotRaw={snapshot?.raw}
              onOpenTicket={onOpenTicket}
              loading={loading}
              error={error}
              descriptionMarkdown={descriptionMarkdown}
              descriptionHtml={descriptionHtml}
              htmlBaseUrl={htmlBaseUrl}
              attachments={attachments}
              sortedComments={sortedComments}
              githubActivityItems={matchedGitHubActivityItems}
              githubActivityLoading={githubActivity.loading}
              {...(githubActivity.warning ? { githubActivityWarning: githubActivity.warning } : {})}
              {...(githubActivity.host ? { githubHost: githubActivity.host } : {})}
              {...(githubActivity.account ? { githubAccount: githubActivity.account } : {})}
            />
          </ScrollArea>
        </section>
        <TicketDetailKickoffAside
          displayId={displayId}
          issueThreads={issueThreads}
          projectId={project.id}
          ticketId={ticketId}
          kickoffContext={kickoffContext}
          providers={backendState.providers}
          isConnected={backendState.connectionStatus === "connected"}
          onOpenThread={onOpenThread}
          onKickoffThread={onKickoffThread}
        />
      </div>
    </div>
  );
}
