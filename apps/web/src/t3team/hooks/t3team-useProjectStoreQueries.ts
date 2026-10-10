import { useCallback, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3TeamThreadFacts } from "@t3tools/contracts";
import type { Project, ThreadShell } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

import { getMockTicketsForProject } from "./t3team-projectStoreUtils";
import {
  collectLiveChildParentIds,
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
  liveThreads: ReadonlyArray<ThreadShell>;
  /** Fork thread facts: a live row mapped without them would drop its pills on merge. */
  factsByThreadId?: ReadonlyMap<string, T3TeamThreadFacts>;
  liveChildParentIds?: ReadonlySet<string>;
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
    .filter((thread) => thread.projectId === canonicalProjectId && !claimedThreadIds.has(thread.id))
    .map((thread) =>
      mapLiveThreadToProjectThread(
        thread,
        resolvedProjectId,
        input.factsByThreadId?.get(thread.id),
        input.liveChildParentIds?.has(thread.id) ?? false,
      ),
    );

  return mergeProjectThreads([...localThreads, ...liveProjectThreads]).filter(
    (thread) => thread.retention !== "ephemeral",
  );
}

export function useProjectStoreQueries(input: {
  projects: ProjectShellProject[];
  threads: ProjectThread[];
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<ThreadShell>;
  factsByThreadId: ReadonlyMap<string, T3TeamThreadFacts>;
}) {
  const { projects, threads, liveProjects, liveThreads, factsByThreadId } = input;
  const liveChildParentIds = useMemo(
    () => collectLiveChildParentIds(threads, liveThreads),
    [liveThreads, threads],
  );

  const getThreadsForProject = useCallback(
    (projectId: string) =>
      resolveProjectThreadsForQuery({
        projectId,
        projects,
        threads,
        liveProjects,
        liveThreads,
        factsByThreadId,
        liveChildParentIds,
      }),
    [factsByThreadId, liveChildParentIds, liveProjects, liveThreads, projects, threads],
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
