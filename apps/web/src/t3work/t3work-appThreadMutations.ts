import { scopeThreadRef } from "@t3tools/client-runtime";
import type { usePrimaryEnvironmentId } from "~/environments/primary";
import { enqueueThreadKickoffAttachments } from "~/t3work/t3work-enqueueThreadKickoffAttachments";
import type { AddToChatPayloadInput } from "~/t3work/t3work-addToChatUtils";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import type { TicketKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import { buildExistingProjectThreadViewState } from "~/t3work/t3work-projectThreadViewState";
import { buildTicketSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";
import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import type { ViewState } from "~/t3work/t3work-types";
import type { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import type { useBackend } from "~/t3work/backend/t3work-index";
import type { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { useThreadActions } from "~/hooks/useThreadActions";

type ProjectStore = ReturnType<typeof useProjectStore>;
type Backend = ReturnType<typeof useBackend>;
type AddToChat = ReturnType<typeof useAddToChat>["addToChatFromRequest"];
type DeleteLiveThread = ReturnType<typeof useThreadActions>["deleteThread"];
type EnvironmentId = ReturnType<typeof usePrimaryEnvironmentId>;
type OnOpenDashboard =
  | ((
      projectId: string,
      dashboardMode?: ProjectDashboardMode,
      embeddedThreadId?: string | null,
    ) => void)
  | undefined;
type OnOpenTicket =
  | ((projectId: string, ticketId: string, embeddedThreadId?: string | null) => void)
  | undefined;

export async function createTicketKickoffThread(input: {
  addToChatFromRequest: AddToChat;
  backend: Backend;
  onOpenTicket: OnOpenTicket;
  store: ProjectStore;
  threadInput: TicketKickoffThreadInput;
}) {
  const { addToChatFromRequest, backend, onOpenTicket, store, threadInput } = input;
  const resolvedProjectId = store.resolveProjectId(threadInput.projectId);
  const thread = store.createThreadForTicket({
    ...threadInput,
    projectId: resolvedProjectId,
  });
  useT3WorkPinnedSidebarStore.getState().pinItem(
    buildTicketSidebarPinnedItem({
      projectId: resolvedProjectId,
      ticketId: threadInput.ticketId,
    }),
  );
  enqueueThreadKickoffAttachments(thread.id, threadInput.kickoffContextAttachments);
  onOpenTicket?.(resolvedProjectId, threadInput.ticketId, thread.id);

  const project = store.allProjects.find((candidate) => candidate.id === resolvedProjectId);
  const ticket = store
    .getTicketsForProject(resolvedProjectId)
    .find((candidate) => candidate.id === threadInput.ticketId);

  if (!backend || !project || !ticket) {
    return;
  }

  const jiraSummary = buildJiraWorkItemSummary(ticket);
  const projectTickets = store.getTicketsForProject(resolvedProjectId);
  await addToChatFromRequest(
    {
      projectId: resolvedProjectId,
      projectTitle: project.title,
      ...(project.workspace?.rootPath ? { projectWorkspaceRoot: project.workspace.rootPath } : {}),
      targetLabel: `${ticket.ref.displayId} ${ticket.ref.title}`,
      targetType: "work-item",
      kind: "jira-work-item",
      ...(jiraSummary.jiraIssueType ? { jiraIssueType: jiraSummary.jiraIssueType } : {}),
      ...(jiraSummary.jiraIssueTypeIconUrl
        ? { jiraIssueTypeIconUrl: jiraSummary.jiraIssueTypeIconUrl }
        : {}),
      summaryItems: jiraSummary.summaryItems,
      payload: (progress?: AddToChatPayloadInput) =>
        buildTicketContextBundle({
          backend,
          project,
          ticket,
          projectTickets,
          githubActivityItems: threadInput.githubActivityItems,
          ...(progress?.reportProgress ? { onProgress: progress.reportProgress } : {}),
        }),
    },
    { type: "kickoff", projectId: resolvedProjectId, ticketId: threadInput.ticketId },
  );
}

export function selectProjectThread(input: {
  onOpenDashboard: OnOpenDashboard;
  onOpenThread: ((projectId: string, threadId: string) => void) | undefined;
  onOpenTicket: OnOpenTicket;
  projectId: string;
  store: ProjectStore;
  threadId: string;
}) {
  const { onOpenDashboard, onOpenThread, onOpenTicket, projectId, store, threadId } = input;
  const resolvedProjectId = store.resolveProjectId(projectId);
  store.selectThread(resolvedProjectId, threadId);
  const thread = store
    .getThreadsForProject(resolvedProjectId)
    .find((candidate) => candidate.id === threadId);

  if (!thread) {
    onOpenThread?.(resolvedProjectId, threadId);
    return;
  }

  const nextView = buildExistingProjectThreadViewState(resolvedProjectId, thread);

  if (nextView.type === "ticket") {
    onOpenTicket?.(resolvedProjectId, nextView.ticketId, threadId);
    return;
  }

  if (nextView.type === "dashboard") {
    onOpenDashboard?.(resolvedProjectId, thread.dashboardMode, threadId);
    return;
  }

  onOpenThread?.(resolvedProjectId, threadId);
}

export async function deleteAppThread(input: {
  activeView: ViewState | null;
  deleteLiveThread: DeleteLiveThread;
  environmentId: EnvironmentId;
  onOpenDashboard: OnOpenDashboard;
  onOpenTicket: OnOpenTicket;
  store: ProjectStore;
  threadId: string;
}) {
  const {
    activeView,
    deleteLiveThread,
    environmentId,
    onOpenDashboard,
    onOpenTicket,
    store,
    threadId,
  } = input;
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  const deletedWasActive =
    activeView?.type === "thread"
      ? activeView.threadId === threadId
      : activeView?.embeddedThreadId === threadId;

  if (environmentId) {
    await deleteLiveThread(scopeThreadRef(environmentId, threadId as never));
  }

  store.deleteThread(threadId);

  if (!deletedWasActive) {
    return;
  }

  const projectId = activeView?.projectId ?? thread?.projectId;
  const ticketId = activeView?.type === "ticket" ? activeView.ticketId : thread?.ticketId;

  if (projectId && ticketId) {
    onOpenTicket?.(store.resolveProjectId(projectId), ticketId);
    return;
  }

  if (projectId) {
    onOpenDashboard?.(store.resolveProjectId(projectId), thread?.dashboardMode);
  }
}
