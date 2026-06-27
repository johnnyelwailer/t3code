import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";
import {
  mergeProjectThreadLocalState,
  upsertProjectThreadLocalState,
} from "~/t3work/t3work-threadToolContext";
import { readT3workThreadPlacementFromActivities } from "~/t3work/hooks/t3work-threadHandoffMetadata";
import { resolveStoredProjectId } from "./t3work-threadProjectResolution";

export {
  normalizeWorkspaceRootPath,
  readLiveProjectRoots,
  readOwnedWorkspaceRoots,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
} from "./t3work-threadProjectResolution";

export function mapLiveThreadToProjectThread(
  thread: Thread,
  projectIdOverride: string = thread.projectId,
): ProjectThread {
  const placement = readT3workThreadPlacementFromActivities(thread);

  return {
    id: thread.id,
    projectId: projectIdOverride,
    ...placement,
    title: thread.title,
    messageCount: thread.messages.length,
    lastMessageAt: thread.latestTurn?.completedAt ?? thread.updatedAt ?? thread.createdAt,
    createdAt: thread.createdAt,
    status: thread.session?.lastError
      ? "error"
      : thread.session?.status === "running" || thread.session?.status === "starting"
        ? "running"
        : thread.session?.status === "error"
          ? "error"
          : thread.session?.status === "stopped" || thread.archivedAt
            ? "completed"
            : "idle",
    // A clock-parked routine (Epic 27): carry the server-computed wake instant so the sidebar
    // pill reads "Sleeping until <time>". Absent when no run on this thread is sleeping.
    ...(thread.sleepingUntil !== undefined ? { sleepingUntil: thread.sleepingUntil } : {}),
  };
}

export function mergeProjectThreads(threads: ReadonlyArray<ProjectThread>): ProjectThread[] {
  const byId = new Map<string, ProjectThread>();

  for (const thread of threads) {
    byId.set(thread.id, mergeProjectThreadLocalState(byId.get(thread.id), thread));
  }

  return [...byId.values()];
}

export function syncLiveThreadMetadataToLocalState(input: {
  threads: ReadonlyArray<ProjectThread>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
}): ProjectThread[] {
  let nextThreads = input.threads as ProjectThread[];

  for (const liveThread of input.liveThreads) {
    const shadowThread = mapLiveThreadToProjectThread(
      liveThread,
      resolveStoredProjectId(liveThread.projectId, input.storedProjects, input.liveProjects),
    );

    if (!shadowThread.parentThreadId && !shadowThread.ticketId) {
      continue;
    }

    nextThreads = upsertProjectThreadLocalState(nextThreads, shadowThread);
  }

  return nextThreads;
}
