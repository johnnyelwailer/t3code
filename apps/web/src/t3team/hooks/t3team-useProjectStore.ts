import { useState, useCallback, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useProjects, useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useT3TeamThreadFactsMap } from "~/state/t3team-threadSideStreams";
import type { ViewState, ProjectThread, ProjectThreadDisplayMode } from "~/t3team/t3team-types";
import { useProjectStoreActions } from "./t3team-useProjectStoreActions";
import { useProjectStoreQueries } from "./t3team-useProjectStoreQueries";
import { useProjectThreadActions } from "./t3team-useProjectThreadActions";
import { useHydrateThreadPlacements } from "./t3team-useHydrateThreadPlacements";
import { useHydrateStoredProjects } from "./t3team-useHydrateStoredProjects";
import { useHydrateStoredThreads } from "./t3team-useHydrateStoredThreads";
import { findProjectThreadById } from "./t3team-projectThreadLookup";
import {
  generateProjectId,
  deriveLooseWorkspaceProjects,
  loadStoredProjects,
  reconcileStoredProjectsWithLive,
} from "./t3team-projectStoreUtils";
import { useProjectStoreSyncEffects } from "./t3team-useProjectStore-syncEffects";
import { isListedLiveThread, resolveStoredProjectId } from "./t3team-threadBridge";

export function useProjectStore() {
  const [storedProjects, setStoredProjects] = useState<ProjectShellProject[]>(loadStoredProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => loadStoredProjects()[0]?.id ?? null,
  );
  const [view, setView] = useState<ViewState | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(loadStoredProjects().map((p) => p.id)),
  );
  const [threads, setThreads] = useState<ProjectThread[]>([]);
  const [threadsHydrated, setThreadsHydrated] = useState(false);
  const liveProjects = useProjects();
  // Shells only, like upstream's sidebar: see mapLiveThreadToProjectThread. Provider-native
  // subagents stay hidden there too (isListedLiveThread).
  const allLiveThreads = useThreadShells();
  const liveThreads = useMemo(() => allLiveThreads.filter(isListedLiveThread), [allLiveThreads]);
  const factsByThreadId = useT3TeamThreadFactsMap(usePrimaryEnvironmentId());
  useHydrateStoredProjects({
    setStoredProjects,
    setSelectedProjectId,
    setExpandedProjectIds,
  });
  useHydrateStoredThreads({ setThreads, setThreadsHydrated });
  useHydrateThreadPlacements({
    threads,
    setThreads,
    storedProjects,
    liveProjects,
    liveThreads,
    factsByThreadId,
  });
  useProjectStoreSyncEffects({
    threads,
    threadsHydrated,
    storedProjects,
    liveProjects,
    liveThreads,
    factsByThreadId,
    setThreads,
  });

  const reconciledStoredProjects = useMemo(
    () => reconcileStoredProjectsWithLive(storedProjects, liveProjects),
    [liveProjects, storedProjects],
  );
  const looseWorkspaceProjects = useMemo(
    () => deriveLooseWorkspaceProjects(storedProjects, liveProjects),
    [liveProjects, storedProjects],
  );
  const resolveProjectId = useCallback(
    (projectId: string) => resolveStoredProjectId(projectId, storedProjects, liveProjects),
    [liveProjects, storedProjects],
  );
  const visibleLooseWorkspaceProjects = useMemo(
    () => looseWorkspaceProjects.filter((project) => resolveProjectId(project.id) === project.id),
    [looseWorkspaceProjects, resolveProjectId],
  );
  const allProjects = useMemo(
    () => [...reconciledStoredProjects, ...looseWorkspaceProjects],
    [looseWorkspaceProjects, reconciledStoredProjects],
  );

  const { getThreadsForProject, getTicketsForProject } = useProjectStoreQueries({
    projects: allProjects,
    threads,
    liveProjects,
    liveThreads,
  });
  const {
    addProject,
    deleteProject,
    renameProject,
    updateProject,
    toggleProjectExpanded,
    selectProject,
    selectTicket,
    selectThread,
    selectStandaloneThread,
  } = useProjectStoreActions({
    allProjects,
    getThreadsForProject,
    setExpandedProjectIds,
    setSelectedProjectId,
    setStoredProjects,
    setThreads,
    setView,
  });

  const {
    createThread,
    createThreadForTicket,
    markThreadKickoffConsumed,
    deleteThread,
    renameThread,
    updateThreadDisplayMode: updateThreadDisplayModeInternal,
  } = useProjectThreadActions({
    threads,
    setThreads,
    setSelectedProjectId,
    setExpandedProjectIds,
    setView,
  });

  const updateThreadDisplayMode = useCallback(
    (threadId: string, displayMode: ProjectThreadDisplayMode) => {
      const fallbackThread =
        threads.find((thread) => thread.id === threadId) ??
        findProjectThreadById(
          allProjects.map((project) => project.id),
          getThreadsForProject,
          threadId,
        );

      updateThreadDisplayModeInternal(threadId, displayMode, fallbackThread);
    },
    [allProjects, getThreadsForProject, threads, updateThreadDisplayModeInternal],
  );

  // Referential stability matters: this object is a dependency of the sidebar
  // handler `useCallback`s (`useAppHandlers`) and of effects (`useResolvedViewSync`).
  // Returning a fresh literal on every render gave every consumer a new `store`
  // identity each render, which defeated the memo barrier on the thread rows and
  // re-rendered the whole Work-lens list on every selection. Every field below is
  // already referentially stable (state values or `useCallback` results), so the
  // memo keeps the object's identity while none of them change.
  return useMemo(
    () => ({
      projects: reconciledStoredProjects,
      looseWorkspaceProjects: visibleLooseWorkspaceProjects,
      allProjects,
      selectedProject: allProjects.find((project) => project.id === selectedProjectId) ?? null,
      selectedProjectId,
      view,
      expandedProjectIds,
      threads,
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
      selectStandaloneThread,
      createThread,
      createThreadForTicket,
      markThreadKickoffConsumed,
      deleteThread,
      renameThread,
      updateThreadDisplayMode,
      resolveProjectId,
      setView,
    }),
    [
      reconciledStoredProjects,
      visibleLooseWorkspaceProjects,
      allProjects,
      selectedProjectId,
      view,
      expandedProjectIds,
      threads,
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
      selectStandaloneThread,
      createThread,
      createThreadForTicket,
      markThreadKickoffConsumed,
      deleteThread,
      renameThread,
      updateThreadDisplayMode,
      resolveProjectId,
    ],
  );
}

export { generateProjectId };
