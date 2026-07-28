/* oxlint-disable eslint/no-unused-expressions -- Existing merged lint debt; keep green while preserving behavior. */
import { useCallback } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useThreadActions } from "~/hooks/useThreadActions";
import { useBackend } from "~/t3team/backend/t3team-index";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { matchesProjectThreadTicket } from "~/t3team/t3team-ticketLookup";
import type {
  ProjectKickoffThreadInput,
  TicketKickoffThreadInput,
} from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";
import { useLocalWorkspaceCommands } from "~/t3team/hooks/t3team-useLocalWorkspaceCommands";
import {
  createTicketKickoffThread,
  deleteAppThread,
  openEmbeddedProjectThread,
  selectProjectThread,
} from "~/t3team/t3team-appThreadMutations";
import type { AppHandlersInput } from "~/t3team/t3team-appHandlersTypes";

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
  const { deleteThread: deleteLiveThread } = useThreadActions();
  const { handleDeleteProject, handleRenameProject } = useLocalWorkspaceCommands({
    store,
    activeView,
    onOpenHome,
  });

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const resolvedProjectId = store.resolveProjectId(projectId);
      store.selectProject(resolvedProjectId);
      if (store.looseWorkspaceProjects.some((project) => project.id === resolvedProjectId)) {
        store.setView(null);
        onOpenHome?.();
        return;
      }
      onOpenDashboard?.(resolvedProjectId);
    },
    [onOpenDashboard, onOpenHome, store],
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
        backend,
        onOpenTicket,
        store,
        threadInput: input,
      }),
    [backend, onOpenTicket, store],
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
    handleRenameProject,
    handleDeleteThread,
  };
}
