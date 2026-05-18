import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";

export function resolveCanonicalProjectIdForWorkspaceRoot(
  workspaceRoot: string | undefined,
  fallbackProjectId: string,
  liveProjects: ReadonlyArray<Project>,
): string {
  if (!workspaceRoot) {
    return fallbackProjectId;
  }

  return liveProjects.find((candidate) => candidate.cwd === workspaceRoot)?.id ?? fallbackProjectId;
}

export function resolveCanonicalProjectId(
  project: ProjectShellProject | null | undefined,
  liveProjects: ReadonlyArray<Project>,
): string | null {
  const workspaceRoot = project?.workspace?.rootPath;
  if (!workspaceRoot) {
    return null;
  }

  return liveProjects.find((candidate) => candidate.cwd === workspaceRoot)?.id ?? null;
}

export function mapLiveThreadToProjectThread(thread: Thread): ProjectThread {
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    messageCount: thread.messages.length,
    lastMessageAt: thread.latestTurn?.completedAt ?? thread.updatedAt ?? thread.createdAt,
    createdAt: thread.createdAt,
    status: thread.error
      ? "error"
      : thread.session?.status === "running" || thread.session?.status === "connecting"
        ? "running"
        : thread.session?.status === "error"
          ? "error"
          : thread.session?.status === "closed" || thread.archivedAt
            ? "completed"
            : "idle",
  };
}

export function mergeProjectThreads(threads: ReadonlyArray<ProjectThread>): ProjectThread[] {
  const byId = new Map<string, ProjectThread>();

  for (const thread of threads) {
    byId.set(thread.id, thread);
  }

  return [...byId.values()];
}
