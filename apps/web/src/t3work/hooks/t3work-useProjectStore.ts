import { useState, useCallback, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useShallow } from "zustand/react/shallow";
import {
  selectProjectsAcrossEnvironments,
  selectThreadsAcrossEnvironments,
  useStore,
} from "~/store";
import type {
  ProjectSortOrder,
  ThreadSortOrder,
  ViewState,
  ProjectThread,
} from "~/t3work/t3work-types";
import { MOCK_THREADS } from "~/t3work/data/t3work-mockThreads";
import { useProjectStoreQueries } from "./t3work-useProjectStoreQueries";
import { useProjectThreadActions } from "./t3work-useProjectThreadActions";
import { useHydrateStoredProjects } from "./t3work-useHydrateStoredProjects";
import {
  generateProjectId,
  deriveLooseWorkspaceProjects,
  loadStoredProjects,
  saveStoredProjects,
  upsertProjectBySource,
} from "./t3work-projectStoreUtils";
import { hydrateStoredProjects, persistStoredProjects } from "./t3work-projectStorePersistence";

export function useProjectStore() {
  const [storedProjects, setStoredProjects] = useState<ProjectShellProject[]>(loadStoredProjects);
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
  const liveProjects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const liveThreads = useStore(useShallow(selectThreadsAcrossEnvironments));
  useHydrateStoredProjects({
    setStoredProjects,
    setSelectedProjectId,
    setExpandedProjectIds,
  });

  const looseWorkspaceProjects = useMemo(
    () => deriveLooseWorkspaceProjects(storedProjects, liveProjects),
    [liveProjects, storedProjects],
  );
  const allProjects = useMemo(
    () => [...storedProjects, ...looseWorkspaceProjects],
    [looseWorkspaceProjects, storedProjects],
  );

  const { getThreadsForProject, getTicketsForProject } = useProjectStoreQueries({
    projects: allProjects,
    threads,
    liveProjects,
    liveThreads,
  });

  const addProject = useCallback((project: ProjectShellProject) => {
    setStoredProjects((prev) => {
      const next = upsertProjectBySource(prev, project);
      saveStoredProjects(next);
      persistStoredProjects(next);
      return next;
    });
    setSelectedProjectId(project.id);
    setExpandedProjectIds((prev) => new Set(prev).add(project.id));
    setView({ type: "dashboard", projectId: project.id });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setStoredProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveStoredProjects(next);
      persistStoredProjects(next);
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

  const renameProject = useCallback(
    (id: string, newTitle: string) => {
      setStoredProjects((prev) => {
        const existingProject = prev.find((candidate) => candidate.id === id);
        const sourceProject =
          existingProject ?? allProjects.find((candidate) => candidate.id === id);
        if (!sourceProject) {
          return prev;
        }
        const updatedProject = { ...sourceProject, title: newTitle };
        const next = existingProject
          ? prev.map((candidate) => (candidate.id === id ? updatedProject : candidate))
          : [...prev, updatedProject];
        saveStoredProjects(next);
        persistStoredProjects(next);
        return next;
      });
    },
    [allProjects],
  );

  const updateProject = useCallback((id: string, nextProject: ProjectShellProject) => {
    setStoredProjects((prev) => {
      const existingProject = prev.some((candidate) => candidate.id === id);
      const next = existingProject
        ? prev.map((candidate) => (candidate.id === id ? nextProject : candidate))
        : [...prev, nextProject];
      saveStoredProjects(next);
      persistStoredProjects(next);
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

  const {
    createThread,
    createThreadForTicket,
    markThreadKickoffConsumed,
    deleteThread,
    renameThread,
  } = useProjectThreadActions({
    threads,
    setThreads,
    setSelectedProjectId,
    setExpandedProjectIds,
    setView,
  });

  const selectedProject = allProjects.find((project) => project.id === selectedProjectId) ?? null;

  return {
    projects: storedProjects,
    looseWorkspaceProjects,
    allProjects,
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
