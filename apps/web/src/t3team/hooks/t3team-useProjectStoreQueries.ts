import { useCallback } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

import { getMockTicketsForProject } from "./t3team-projectStoreUtils";
import {
  mapLiveThreadToProjectThread,
  mergeProjectThreads,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveStoredProjectId,
} from "./t3team-threadBridge";

export function resolveProjectThreadsForQuery(input: {
  projectId: string;
  projects: ProjectShellProject[];
  threads: ProjectThread[];
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
}) {
  const { projectId, projects, threads, liveProjects, liveThreads } = input;
  const resolvedProjectId = resolveStoredProjectId(projectId, projects, liveProjects);
  const project =
    projects.find((candidate) => candidate.id === resolvedProjectId) ??
    projects.find((candidate) => candidate.id === projectId);
  const canonicalProjectId = resolveCanonicalProjectId(project, liveProjects) ?? projectId;
  const remappedLocalThreads = threads.map((thread) =>
    remapProjectThreadToStoredProject(thread, projects, liveProjects),
  );
  const localThreads = remappedLocalThreads.filter(
    (thread) => thread.projectId === resolvedProjectId && thread.retention !== "ephemeral",
  );
  const claimedThreadIds = new Set(
    remappedLocalThreads
      .filter((thread) => thread.projectId !== resolvedProjectId)
      .map((thread) => thread.id),
  );
  const liveProjectThreads = liveThreads
    .filter(
      (thread) =>
        thread.projectId === canonicalProjectId &&
        thread.retention !== "ephemeral" &&
        !claimedThreadIds.has(thread.id),
    )
    .map((thread) => mapLiveThreadToProjectThread(thread, resolvedProjectId));

  return mergeProjectThreads([...localThreads, ...liveProjectThreads]).filter(
    (thread) => thread.retention !== "ephemeral",
  );
}

export function useProjectStoreQueries(input: {
  projects: ProjectShellProject[];
  threads: ProjectThread[];
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
}) {
  const { projects, threads, liveProjects, liveThreads } = input;

  const getThreadsForProject = useCallback(
    (projectId: string) =>
      resolveProjectThreadsForQuery({
        projectId,
        projects,
        threads,
        liveProjects,
        liveThreads,
      }),
    [liveProjects, liveThreads, projects, threads],
  );

  const getTicketsForProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      return project ? getMockTicketsForProject(project) : [];
    },
    [projects],
  );

  return {
    getThreadsForProject,
    getTicketsForProject,
  };
}
