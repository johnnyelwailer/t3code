import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";
import { deriveThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";
import {
  mergeProjectThreadLocalState,
  upsertProjectThreadLocalState,
} from "~/t3team/t3team-threadToolContext";
import {
  indexT3TeamChildParentThreads,
  readT3TeamThreadPlacementFromActivities,
} from "~/t3team/hooks/t3team-threadHandoffMetadata";
import { resolveStoredProjectId } from "./t3team-threadProjectResolution";

export {
  normalizeWorkspaceRootPath,
  readLiveProjectRoots,
  readOwnedWorkspaceRoots,
  remapProjectThreadToStoredProject,
  resolveCanonicalProjectId,
  resolveCanonicalProjectIdForWorkspaceRoot,
  resolveStoredProjectId,
} from "./t3team-threadProjectResolution";

export function mapLiveThreadToProjectThread(
  thread: Thread,
  projectIdOverride: string = thread.projectId,
): ProjectThread {
  const placement = readT3TeamThreadPlacementFromActivities(thread);
  const providerKind = thread.messages.some((message) => message.id.startsWith("local:codex:"))
    ? "codex"
    : thread.messages.some((message) => message.id.startsWith("local:claudeAgent:"))
      ? "claudeAgent"
      : undefined;

  return {
    id: thread.id,
    projectId: projectIdOverride,
    ...placement,
    title: thread.title,
    ...(providerKind ? { providerKind } : {}),
    messageCount: thread.messages.length,
    lastMessageAt: thread.latestTurn?.completedAt ?? thread.updatedAt ?? thread.createdAt,
    createdAt: thread.createdAt,
    // GHE #52 (active-children live-sync follow-up to GHE #234): the running
    // determination mirrors the canonical server primitive `deriveThreadRunState`
    // (packages/shared/t3team-threadRunStatus) — the one read-model source for
    // "is this thread running". It additionally reads the live-running signals
    // a plain session check misses: a turn in flight before the provider session
    // registers, and native background work (subagents/workflow children) that
    // stays alive after the turn settles. Without them those children read
    // "idle" and the active-children indicator never lights for them. The
    // lastError/stopped/archived branches above keep the t3team sidebar's
    // historical vocabulary (error/completed) intact.
    status: thread.session?.lastError
      ? "error"
      : thread.session?.status === "stopped" || thread.archivedAt
        ? "completed"
        : thread.session?.status === "error"
          ? "error"
          : deriveThreadRunState({
                session: thread.session,
                latestTurn: thread.latestTurn,
                ...(thread.backgroundLiveness !== undefined
                  ? { backgroundLiveness: thread.backgroundLiveness }
                  : {}),
              }) === "running"
            ? "running"
            : "idle",
    ...(thread.retention !== undefined ? { retention: thread.retention } : {}),
    // A clock-parked routine (Epic 27): carry the server-computed wake instant so the sidebar
    // pill reads "Sleeping until <time>". Absent when no run on this thread is sleeping.
    ...(thread.sleepingUntil !== undefined ? { sleepingUntil: thread.sleepingUntil } : {}),
    ...(thread.workflowRunStatus !== undefined
      ? {
          workflowRunStatus: {
            ...thread.workflowRunStatus,
            runId: thread.workflowRunStatus.runId ?? "",
          },
        }
      : {}),
    ...(thread.childStatus !== undefined ? { childStatus: thread.childStatus } : {}),
    ...(thread.childStatusUpdatedAt !== undefined
      ? { childStatusUpdatedAt: thread.childStatusUpdatedAt }
      : {}),
    // GHE #40/#208: live LLM enrichment + deterministic 4-state word for the
    // sidebar pills; both absent/idle on settled threads.
    ...(thread.activityLabel !== undefined ? { activityLabel: thread.activityLabel } : {}),
    ...(thread.activityState !== undefined ? { activityState: thread.activityState } : {}),
    ...(thread.activityStateUpdatedAt !== undefined
      ? { activityStateUpdatedAt: thread.activityStateUpdatedAt }
      : {}),
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
  const parentByChildId = indexT3TeamChildParentThreads(input.liveThreads);

  for (const liveThread of input.liveThreads) {
    const mappedThread = mapLiveThreadToProjectThread(
      liveThread,
      resolveStoredProjectId(liveThread.projectId, input.storedProjects, input.liveProjects),
    );
    const inferredParentThreadId = parentByChildId.get(liveThread.id);
    const shadowThread = {
      ...mappedThread,
      ...(!mappedThread.parentThreadId && inferredParentThreadId
        ? { parentThreadId: inferredParentThreadId }
        : {}),
    };

    nextThreads = upsertProjectThreadLocalState(nextThreads, shadowThread);
  }

  return nextThreads;
}
