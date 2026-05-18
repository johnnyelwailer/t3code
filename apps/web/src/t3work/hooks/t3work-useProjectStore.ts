import { useState, useCallback } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  ProjectSortOrder,
  ThreadSortOrder,
  ViewState,
  ProjectThread,
} from "~/t3work/t3work-types";
import { MOCK_THREADS } from "~/t3work/data/t3work-mockThreads";
import {
  buildThreadForProject,
  generateProjectId,
  getMockTicketsForProject,
  loadStoredProjects,
  saveStoredProjects,
  upsertProjectBySource,
} from "./t3work-projectStoreUtils";

export function useProjectStore() {
  const [projects, setProjects] = useState<ProjectShellProject[]>(loadStoredProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => loadStoredProjects()[0]?.id ?? null,
  );
  const [view, setView] = useState<ViewState | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(loadStoredProjects().map((p) => p.id)),
  );
  const [threads, setThreads] = useState<ProjectThread[]>(MOCK_THREADS);
  const [projectSortOrder, setProjectSortOrder] = useState<ProjectSortOrder>("updated_at");
  const [threadSortOrder, setThreadSortOrder] = useState<ThreadSortOrder>("updated_at");
  const [threadPreviewCount, setThreadPreviewCount] = useState(5);

  const getThreadsForProject = useCallback(
    (projectId: string) => threads.filter((t) => t.projectId === projectId),
    [threads],
  );

  const getTicketsForProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      return project ? getMockTicketsForProject(project) : [];
    },
    [projects],
  );

  const addProject = useCallback((project: ProjectShellProject) => {
    setProjects((prev) => {
      const next = upsertProjectBySource(prev, project);
      saveStoredProjects(next);
      return next;
    });
    setSelectedProjectId(project.id);
    setExpandedProjectIds((prev) => new Set(prev).add(project.id));
    setView({ type: "dashboard", projectId: project.id });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveStoredProjects(next);
      return next;
    });
    setThreads((prev) => prev.filter((t) => t.projectId !== id));
    setSelectedProjectId((prev) => (prev === id ? null : prev));
    setView((prev) => (prev && prev.projectId === id ? null : prev));
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const renameProject = useCallback((id: string, newTitle: string) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, title: newTitle } : p));
      saveStoredProjects(next);
      return next;
    });
  }, []);

  const updateProject = useCallback((id: string, nextProject: ProjectShellProject) => {
    setProjects((prev) => {
      const next = prev.map((candidate) => (candidate.id === id ? nextProject : candidate));
      saveStoredProjects(next);
      return next;
    });
  }, []);

  const toggleProjectExpanded = useCallback((id: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setView({ type: "dashboard", projectId: id });
  }, []);

  const selectTicket = useCallback((projectId: string, ticketId: string) => {
    setSelectedProjectId(projectId);
    setView({ type: "ticket", projectId, ticketId });
  }, []);

  const selectThread = useCallback((projectId: string, threadId: string) => {
    setSelectedProjectId(projectId);
    setView({ type: "thread", projectId, threadId });
  }, []);

  const createThread = useCallback(
    (
      projectId: string,
      options?: {
        title?: string;
        ticketId?: string;
        kickoffMessage?: string;
        kickoffPending?: boolean;
        kickoffModelSelection?: ModelSelection;
        kickoffRuntimeMode?: RuntimeMode;
        kickoffInteractionMode?: ProviderInteractionMode;
      },
    ) => {
      const newThread = buildThreadForProject(projectId, options);
      setThreads((prev) => [...prev, newThread]);
      setSelectedProjectId(projectId);
      setExpandedProjectIds((prev) => new Set(prev).add(projectId));
      setView({ type: "thread", projectId, threadId: newThread.id });
      return newThread;
    },
    [],
  );

  const createThreadForTicket = useCallback(
    (input: {
      projectId: string;
      ticketId: string;
      ticketDisplayId: string;
      kickoffMessage: string;
      kickoffModelSelection: ModelSelection;
      kickoffRuntimeMode: RuntimeMode;
      kickoffInteractionMode: ProviderInteractionMode;
    }) => {
      const matching = threads.filter(
        (thread) => thread.projectId === input.projectId && thread.ticketId === input.ticketId,
      );
      const sequence = matching.length + 1;
      return createThread(input.projectId, {
        ticketId: input.ticketId,
        title: `${input.ticketDisplayId} kickoff ${sequence}`,
        kickoffMessage: input.kickoffMessage,
        kickoffPending: true,
        kickoffModelSelection: input.kickoffModelSelection,
        kickoffRuntimeMode: input.kickoffRuntimeMode,
        kickoffInteractionMode: input.kickoffInteractionMode,
      });
    },
    [createThread, threads],
  );

  const markThreadKickoffConsumed = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, kickoffPending: false } : thread,
      ),
    );
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setView((prev) => (prev && prev.type === "thread" && prev.threadId === threadId ? null : prev));
  }, []);

  const renameThread = useCallback((threadId: string, newTitle: string) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t)));
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return {
    projects,
    selectedProject,
    selectedProjectId,
    view,
    expandedProjectIds,
    threads,
    projectSortOrder,
    threadSortOrder,
    threadPreviewCount,
    getThreadsForProject,
    getTicketsForProject,
    addProject,
    deleteProject,
    renameProject,
    updateProject,
    toggleProjectExpanded,
    selectProject,
    selectTicket,
    selectThread,
    createThread,
    createThreadForTicket,
    markThreadKickoffConsumed,
    deleteThread,
    renameThread,
    setProjectSortOrder,
    setThreadSortOrder,
    setThreadPreviewCount,
    setView,
  };
}

export { generateProjectId };
