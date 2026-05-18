import { useCallback } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ViewState } from "~/t3work/t3work-types";

type AppHandlersInput = {
  store: ReturnType<typeof useProjectStore>;
  activeView: ViewState | null;
  onOpenHome: (() => void) | undefined;
  onOpenDashboard: ((projectId: string) => void) | undefined;
  onOpenTicket: ((projectId: string, ticketId: string) => void) | undefined;
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
  const handleSelectProject = useCallback(
    (projectId: string) => {
      store.selectProject(projectId);
      onOpenDashboard?.(projectId);
    },
    [onOpenDashboard, store],
  );

  const handleSelectTicket = useCallback(
    (projectId: string, ticketId: string) => {
      store.selectTicket(projectId, ticketId);
      onOpenTicket?.(projectId, ticketId);
    },
    [onOpenTicket, store],
  );

  const handleSelectThread = useCallback(
    (projectId: string, threadId: string) => {
      store.selectThread(projectId, threadId);
      onOpenThread?.(projectId, threadId);
    },
    [onOpenThread, store],
  );

  const handleCreateThread = useCallback(
    (projectId: string) => {
      const thread = store.createThread(projectId);
      onOpenThread?.(projectId, thread.id);
    },
    [onOpenThread, store],
  );

  const handleCreateTicketKickoffThread = useCallback(
    (input: {
      projectId: string;
      ticketId: string;
      ticketDisplayId: string;
      kickoffMessage: string;
      kickoffModelSelection: ModelSelection;
      kickoffRuntimeMode: RuntimeMode;
      kickoffInteractionMode: ProviderInteractionMode;
    }) => {
      const thread = store.createThreadForTicket(input);
      onOpenThread?.(input.projectId, thread.id);
    },
    [onOpenThread, store],
  );

  const handleCreateProjectKickoffThread = useCallback(
    (input: {
      projectId: string;
      kickoffMessage: string;
      kickoffModelSelection: ModelSelection;
      kickoffRuntimeMode: RuntimeMode;
      kickoffInteractionMode: ProviderInteractionMode;
    }) => {
      const thread = store.createThread(input.projectId, {
        title: "Project kickoff",
        kickoffMessage: input.kickoffMessage,
        kickoffPending: true,
        kickoffModelSelection: input.kickoffModelSelection,
        kickoffRuntimeMode: input.kickoffRuntimeMode,
        kickoffInteractionMode: input.kickoffInteractionMode,
      });
      onOpenThread?.(input.projectId, thread.id);
    },
    [onOpenThread, store],
  );

  const handleCreateTicketThreadFromSidebar = useCallback(
    (input: { projectId: string; ticketId: string; ticketDisplayId: string }) => {
      const matching = store
        .getThreadsForProject(input.projectId)
        .filter((thread) => thread.ticketId === input.ticketId);
      const sequence = matching.length + 1;
      const thread = store.createThread(input.projectId, {
        ticketId: input.ticketId,
        title: `${input.ticketDisplayId} thread ${sequence}`,
      });
      onOpenThread?.(input.projectId, thread.id);
    },
    [onOpenThread, store],
  );

  const handleThreadKickoffConsumed = useCallback(
    (threadId: string) => {
      store.markThreadKickoffConsumed(threadId);
    },
    [store],
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const deletedWasActive = activeView?.projectId === projectId;
      store.deleteProject(projectId);
      if (deletedWasActive) onOpenHome?.();
    },
    [activeView, onOpenHome, store],
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      const thread = store.threads.find((candidate) => candidate.id === threadId);
      const deletedWasActive = activeView?.type === "thread" && activeView.threadId === threadId;
      store.deleteThread(threadId);
      if (deletedWasActive && thread) onOpenDashboard?.(thread.projectId);
    },
    [activeView, onOpenDashboard, store],
  );

  return {
    handleSelectProject,
    handleSelectTicket,
    handleSelectThread,
    handleCreateThread,
    handleCreateProjectKickoffThread,
    handleCreateTicketKickoffThread,
    handleCreateTicketThreadFromSidebar,
    handleThreadKickoffConsumed,
    handleDeleteProject,
    handleDeleteThread,
  };
}
