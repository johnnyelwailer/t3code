import { useCallback } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { buildExistingProjectThreadViewState } from "~/t3team/t3team-projectThreadViewState";
import { upsertProjectThreadLocalState } from "~/t3team/t3team-threadToolContext";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";
import { isWorkProject } from "~/t3team/t3team-isWorkProject";

import { persistStoredProjects } from "./t3team-projectStorePersistence";
import { saveStoredProjects, upsertProjectBySource } from "./t3team-projectStoreUtils";

export function useProjectStoreActions(input: {
  allProjects: ReadonlyArray<ProjectShellProject>;
  getThreadsForProject: (projectId: string) => ReadonlyArray<ProjectThread>;
  setExpandedProjectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setStoredProjects: React.Dispatch<React.SetStateAction<ProjectShellProject[]>>;
  setThreads: React.Dispatch<React.SetStateAction<ProjectThread[]>>;
  setView: React.Dispatch<React.SetStateAction<ViewState | null>>;
}) {
  const {
    allProjects,
    getThreadsForProject,
    setExpandedProjectIds,
    setSelectedProjectId,
    setStoredProjects,
    setThreads,
    setView,
  } = input;

  const addProject = useCallback(
    (project: ProjectShellProject) => {
      setStoredProjects((prev) => {
        const next = upsertProjectBySource(prev, project);
        saveStoredProjects(next);
        persistStoredProjects(next);
        return next;
      });
      setSelectedProjectId(project.id);
      setExpandedProjectIds((prev) => new Set(prev).add(project.id));
      setView(isWorkProject(project) ? { type: "dashboard", projectId: project.id } : null);
    },
    [setExpandedProjectIds, setSelectedProjectId, setStoredProjects, setView],
  );

  const deleteProject = useCallback(
    (id: string) => {
      setStoredProjects((prev) => {
        const next = prev.filter((project) => project.id !== id);
        saveStoredProjects(next);
        persistStoredProjects(next);
        return next;
      });
      setThreads((prev) => prev.filter((thread) => thread.projectId !== id));
      setSelectedProjectId((prev) => (prev === id ? null : prev));
      setView((prev) => (prev && prev.projectId === id ? null : prev));
      setExpandedProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [setExpandedProjectIds, setSelectedProjectId, setStoredProjects, setThreads, setView],
  );

  const renameProject = useCallback(
    (id: string, newTitle: string) => {
      setStoredProjects((prev) => {
        const existingProject = prev.find((project) => project.id === id);
        const sourceProject = existingProject ?? allProjects.find((project) => project.id === id);
        if (!sourceProject) {
          return prev;
        }

        const updatedProject = { ...sourceProject, title: newTitle };
        const next = existingProject
          ? prev.map((project) => (project.id === id ? updatedProject : project))
          : [...prev, updatedProject];
        saveStoredProjects(next);
        persistStoredProjects(next);
        return next;
      });
    },
    [allProjects, setStoredProjects],
  );

  const updateProject = useCallback(
    (id: string, nextProject: ProjectShellProject) => {
      setStoredProjects((prev) => {
        const existingProject = prev.some((project) => project.id === id);
        const next = existingProject
          ? prev.map((project) => (project.id === id ? nextProject : project))
          : [...prev, nextProject];
        saveStoredProjects(next);
        persistStoredProjects(next);
        return next;
      });
    },
    [setStoredProjects],
  );

  const toggleProjectExpanded = useCallback(
    (id: string) => {
      setExpandedProjectIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [setExpandedProjectIds],
  );

  const selectProject = useCallback(
    (id: string) => {
      setSelectedProjectId(id);
      setView({ type: "dashboard", projectId: id });
    },
    [setSelectedProjectId, setView],
  );

  const selectTicket = useCallback(
    (projectId: string, ticketId: string) => {
      setSelectedProjectId(projectId);
      setView({ type: "ticket", projectId, ticketId });
    },
    [setSelectedProjectId, setView],
  );

  const selectThread = useCallback(
    (projectId: string, threadId: string) => {
      setSelectedProjectId(projectId);
      const thread = getThreadsForProject(projectId).find((candidate) => candidate.id === threadId);
      if (!thread) {
        setView({ type: "thread", projectId, threadId });
        return;
      }

      setThreads((prev) => upsertProjectThreadLocalState(prev, thread));
      setView(buildExistingProjectThreadViewState(projectId, thread));
    },
    [getThreadsForProject, setSelectedProjectId, setThreads, setView],
  );

  const selectStandaloneThread = useCallback(
    (projectId: string, threadId: string) => {
      setSelectedProjectId(projectId);
      setView({ type: "thread", projectId, threadId });
    },
    [setSelectedProjectId, setView],
  );

  return {
    addProject,
    deleteProject,
    renameProject,
    updateProject,
    toggleProjectExpanded,
    selectProject,
    selectTicket,
    selectThread,
    selectStandaloneThread,
  };
}
