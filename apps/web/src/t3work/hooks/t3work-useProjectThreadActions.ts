import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectThreadDisplayMode } from "~/t3work/t3work-projectThreadViewState";
import { buildProjectThreadViewState } from "~/t3work/t3work-projectThreadViewState";
import { setProjectThreadDisplayMode } from "~/t3work/t3work-threadToolContext";
import type {
  ProjectThread,
  T3workKickoffWorkflow,
  T3workThreadToolId,
  ViewState,
} from "~/t3work/t3work-types";
import { createTicketThread } from "./t3work-projectThreadFactories";
import { buildThreadForProject } from "./t3work-projectStoreUtils";

type SetView = Dispatch<SetStateAction<ViewState | null>>;
type SetThreads = Dispatch<SetStateAction<ProjectThread[]>>;

type CreateThreadOptions = {
  title?: string;
  ticketId?: string;
  ticketDisplayId?: string;
  dashboardMode?: ProjectDashboardMode;
  viewMode?: ProjectThreadDisplayMode;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffModelSelection?: ModelSelection;
  kickoffRuntimeMode?: RuntimeMode;
  kickoffInteractionMode?: ProviderInteractionMode;
  selectedToolIds?: ReadonlyArray<T3workThreadToolId>;
  kickoffWorkflow?: T3workKickoffWorkflow;
};

export function useProjectThreadActions(input: {
  threads: ProjectThread[];
  setThreads: SetThreads;
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
  setExpandedProjectIds: Dispatch<SetStateAction<Set<string>>>;
  setView: SetView;
}) {
  const { threads, setThreads, setSelectedProjectId, setExpandedProjectIds, setView } = input;

  const createThread = useCallback(
    (projectId: string, options?: CreateThreadOptions) => {
      const newThread = buildThreadForProject(projectId, options);
      setThreads((prev) => [...prev, newThread]);
      setSelectedProjectId(projectId);
      setExpandedProjectIds((prev) => new Set(prev).add(projectId));
      setView(
        buildProjectThreadViewState({
          projectId,
          threadId: newThread.id,
          ...(options?.ticketId ? { ticketId: options.ticketId } : {}),
          ...(options?.dashboardMode ? { dashboardMode: options.dashboardMode } : {}),
          ...(options?.viewMode ? { displayMode: options.viewMode } : {}),
        }),
      );
      return newThread;
    },
    [setExpandedProjectIds, setSelectedProjectId, setThreads, setView],
  );

  const createThreadForTicket = useCallback(
    (ticketInput: {
      projectId: string;
      ticketId: string;
      ticketDisplayId: string;
      kickoffMessage: string;
      kickoffPending?: boolean;
      kickoffModelSelection: ModelSelection;
      kickoffRuntimeMode: RuntimeMode;
      kickoffInteractionMode: ProviderInteractionMode;
      selectedToolIds: ReadonlyArray<T3workThreadToolId>;
      kickoffWorkflow?: T3workKickoffWorkflow;
    }) =>
      createTicketThread({
        ...ticketInput,
        existingThreads: threads,
        createThread,
      }),
    [createThread, threads],
  );

  const markThreadKickoffConsumed = useCallback(
    (threadId: string) => {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId ? { ...thread, kickoffPending: false } : thread,
        ),
      );
    },
    [setThreads],
  );

  const deleteThread = useCallback(
    (threadId: string) => {
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      setView((prev) => {
        if (!prev) {
          return prev;
        }

        if (prev.type === "thread") {
          return prev.threadId === threadId ? null : prev;
        }

        if (prev.embeddedThreadId !== threadId) {
          return prev;
        }

        return prev.type === "ticket"
          ? { type: "ticket", projectId: prev.projectId, ticketId: prev.ticketId }
          : { type: "dashboard", projectId: prev.projectId };
      });
    },
    [setThreads, setView],
  );

  const renameThread = useCallback(
    (threadId: string, newTitle: string) => {
      setThreads((prev) =>
        prev.map((thread) => (thread.id === threadId ? { ...thread, title: newTitle } : thread)),
      );
    },
    [setThreads],
  );

  const updateThreadDisplayMode = useCallback(
    (threadId: string, displayMode: ProjectThreadDisplayMode, fallbackThread?: ProjectThread) => {
      setThreads((prev) =>
        setProjectThreadDisplayMode(prev, threadId, displayMode, fallbackThread),
      );
    },
    [setThreads],
  );

  return {
    createThread,
    createThreadForTicket,
    markThreadKickoffConsumed,
    deleteThread,
    renameThread,
    updateThreadDisplayMode,
  };
}
