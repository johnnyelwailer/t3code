import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";
import { deriveThreadRunState, isTerminalThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";
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
    // error/stopped/archived branches below keep the t3team sidebar's
    // historical vocabulary (error/completed) intact.
    //
    // "error" is CURRENT state, not history: it follows the session's own
    // status, which a failed turn sets to "error" and the next activity moves
    // on (starting → running → ready). `session.lastError` is the error BANNER
    // text and survives session-state transitions (the provider-sync path
    // carries it forward verbatim), so stamping status from it made one
    // transient error read as red forever — including on settled, idle rows.
    status:
      thread.session?.status === "stopped" || thread.archivedAt
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
    // GHE #304 follow-up: the REAL settle state (thread.settled event fired).
    // The sub-run rosters' "Settled (N)" fold must key off this, never off
    // `status !== "running"` — a fresh terminal child is not settled.
    settled: thread.settledOverride === "settled",
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
    // A question docked in this thread's composer (shell live state). Drives
    // the parent-side pending-question indicator; cleared by the next sync
    // when the shell flag is false.
    ...(thread.hasPendingUserInput !== undefined
      ? { pendingUserInput: thread.hasPendingUserInput }
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

/**
 * A live t3team child that keeps its parent reading "Waiting": not archived,
 * not settled, and its run state is not terminal (completed/failed/aborted)
 * — the SAME terminal predicate the server's children tool uses, so both
 * surfaces agree on what "live" means.
 */
function isLiveT3TeamChild(thread: Thread): boolean {
  if (thread.archivedAt) return false;
  if (thread.settledOverride === "settled") return false;
  return !isTerminalThreadRunState(
    deriveThreadRunState({
      session: thread.session,
      latestTurn: thread.latestTurn,
      ...(thread.backgroundLiveness !== undefined
        ? { backgroundLiveness: thread.backgroundLiveness }
        : {}),
    }),
  );
}

export function syncLiveThreadMetadataToLocalState(input: {
  threads: ReadonlyArray<ProjectThread>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<Thread>;
}): ProjectThread[] {
  let nextThreads = input.threads as ProjectThread[];
  const parentByChildId = indexT3TeamChildParentThreads(input.liveThreads);

  // Pass 1: map every live thread AND collect the parents that have a live
  // t3team child. The relation comes only from the durable handoff index —
  // legacy `parent:N` sub-runs never carry a parentThreadId here, so they
  // can never trigger the waiting indicator.
  const liveChildParentIds = new Set<string>();
  const shadows: ProjectThread[] = [];
  for (const liveThread of input.liveThreads) {
    const mappedThread = mapLiveThreadToProjectThread(
      liveThread,
      resolveStoredProjectId(liveThread.projectId, input.storedProjects, input.liveProjects),
    );
    const inferredParentThreadId = parentByChildId.get(liveThread.id);
    shadows.push({
      ...mappedThread,
      ...(!mappedThread.parentThreadId && inferredParentThreadId
        ? { parentThreadId: inferredParentThreadId }
        : {}),
    });
    const parentId = mappedThread.parentThreadId ?? inferredParentThreadId;
    if (parentId !== undefined && isLiveT3TeamChild(liveThread)) {
      liveChildParentIds.add(parentId);
    }
  }

  // Pass 2: upsert with the waiting fact attached, so a parent's flag reflects
  // children that appear later in the live list. Explicit false clears the
  // flag on the next sync (the merge replaces live-derived fields).
  for (const shadowThread of shadows) {
    nextThreads = upsertProjectThreadLocalState(nextThreads, {
      ...shadowThread,
      waitingOnChildren: liveChildParentIds.has(shadowThread.id),
    });
  }

  return nextThreads;
}
