import { useCallback } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useThreadActions } from "~/hooks/useThreadActions";
import { useBackend } from "~/t3work/backend/t3work-index";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import { matchesProjectThreadTicket } from "~/t3work/t3work-ticketLookup";
import type {
  ProjectKickoffThreadInput,
  TicketKickoffThreadInput,
} from "~/t3work/t3work-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ViewState } from "~/t3work/t3work-types";
import { enqueueThreadKickoffAttachments } from "~/t3work/t3work-enqueueThreadKickoffAttachments";
import {
  createTicketKickoffThread,
  deleteAppThread,
  openEmbeddedProjectThread,
  selectProjectThread,
} from "~/t3work/t3work-appThreadMutations";

type AppHandlersInput = {
  store: ReturnType<typeof useProjectStore>;
  activeView: ViewState | null;
  onOpenHome: (() => void) | undefined;
  onOpenDashboard:
    | ((
        projectId: string,
        dashboardMode?: ProjectDashboardMode,
        embeddedThreadId?: string | null,
      ) => void)
    | undefined;
  onOpenTicket:
    | ((projectId: string, ticketId: string, embeddedThreadId?: string | null) => void)
    | undefined;
  onOpenThread: ((projectId: string, threadId: string) => void) | undefined;
};

export function useAppHandlers({
  store,
  activeView,
  onOpenHome,
  onOpenDashboard,
  onOpenTicket,
  onOpenThread,
}: AppHandlersInput) {
  const environmentId = usePrimaryEnvironmentId();
  const backend = useBackend();
  const { addToChatFromRequest } = useAddToChat();
  const { deleteThread: deleteLiveThread } = useThreadActions();

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      store.selectProject(resolvedProjectId);
      onOpenDashboard?.(resolvedProjectId);
    },
    [onOpenDashboard, store],
  );

  const handleSelectProjectDashboardMode = useCallback(
    (projectId: string, dashboardMode: ProjectDashboardMode) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      store.selectProject(resolvedProjectId);
      onOpenDashboard?.(resolvedProjectId, dashboardMode);
    },
    [onOpenDashboard, store],
  );

  const handleSelectTicket = useCallback(
    (projectId: string, ticketId: string) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      store.selectTicket(resolvedProjectId, ticketId);
      onOpenTicket?.(resolvedProjectId, ticketId);
    },
    [onOpenTicket, store],
  );

  const handleSelectThread = useCallback(
    (projectId: string, threadId: string) =>
      selectProjectThread({
        onOpenDashboard,
        onOpenThread,
        onOpenTicket,
        projectId,
        store,
        threadId,
      }),
    [onOpenDashboard, onOpenThread, onOpenTicket, store],
  );

  const handleOpenFullThread = useCallback(
    (projectId: string, threadId: string) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      store.selectStandaloneThread(resolvedProjectId, threadId);
      onOpenThread?.(resolvedProjectId, threadId);
    },
    [onOpenThread, store],
  );

  const handleOpenEmbeddedThread = useCallback(
    (projectId: string, threadId: string) =>
      openEmbeddedProjectThread({
        onOpenDashboard,
        onOpenTicket,
        projectId,
        store,
        threadId,
      }),
    [onOpenDashboard, onOpenTicket, store],
  );

  const handleCreateThread = useCallback(
    (projectId: string) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      const thread = store.createThread(resolvedProjectId, { viewMode: "thread" });
      onOpenThread?.(resolvedProjectId, thread.id);
      return thread.id;
    },
    [onOpenThread, store],
  );

  const handleCreateTicketKickoffThread = useCallback(
    (input: TicketKickoffThreadInput) =>
      createTicketKickoffThread({
        addToChatFromRequest,
        backend,
        onOpenTicket,
        store,
        threadInput: input,
      }),
    [addToChatFromRequest, backend, onOpenTicket, store],
  );

  const handleCreateProjectKickoffThread = useCallback(
    (input: ProjectKickoffThreadInput) => {
      const resolvedProjectId = store.resolveProjectId(input.projectId);
      const thread = store.createThread(resolvedProjectId, {
        ...(input.dashboardMode ? { dashboardMode: input.dashboardMode } : {}),
        title: "Project kickoff",
        kickoffMessage: input.kickoffMessage,
        kickoffPending: input.kickoffPending ?? true,
        kickoffModelSelection: input.kickoffModelSelection,
        kickoffRuntimeMode: input.kickoffRuntimeMode,
        kickoffInteractionMode: input.kickoffInteractionMode,
        selectedToolIds: input.selectedToolIds,
        ...(input.kickoffWorkflow ? { kickoffWorkflow: input.kickoffWorkflow } : {}),
      });
      enqueueThreadKickoffAttachments(thread.id, input.kickoffContextAttachments);
      onOpenDashboard?.(resolvedProjectId, input.dashboardMode, thread.id);
      return thread.id;
    },
    [onOpenDashboard, store],
  );

  const handleCreateTicketThreadFromSidebar = useCallback(
    (input: { projectId: string; ticketId: string; ticketDisplayId: string }) => {
      const resolvedProjectId = store.resolveProjectId(input.projectId);
      const matching = store
        .getThreadsForProject(resolvedProjectId)
        .filter((thread) =>
          matchesProjectThreadTicket(thread, input.ticketId, input.ticketDisplayId),
        );
      const sequence = matching.length + 1;
      const thread = store.createThread(resolvedProjectId, {
        ticketId: input.ticketId,
        ticketDisplayId: input.ticketDisplayId,
        title: `${input.ticketDisplayId} thread ${sequence}`,
      });
      onOpenTicket?.(resolvedProjectId, input.ticketId, thread.id);
      return thread.id;
    },
    [onOpenTicket, store],
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const deletedWasActive = activeView?.projectId === projectId;
      store.deleteProject(projectId);
      deletedWasActive && onOpenHome?.();
    },
    [activeView, onOpenHome, store],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) =>
      deleteAppThread({
        activeView,
        deleteLiveThread,
        environmentId,
        onOpenDashboard,
        onOpenTicket,
        store,
        threadId,
      }),
    [activeView, deleteLiveThread, environmentId, onOpenDashboard, onOpenTicket, store],
  );

  return {
    handleSelectProject,
    handleSelectProjectDashboardMode,
    handleSelectTicket,
    handleSelectThread,
    handleOpenFullThread,
    handleOpenEmbeddedThread,
    handleCreateThread,
    handleCreateProjectKickoffThread,
    handleCreateTicketKickoffThread,
    handleCreateTicketThreadFromSidebar,
    handleThreadKickoffConsumed: store.markThreadKickoffConsumed,
    handleDeleteProject,
    handleDeleteThread,
  };
}
