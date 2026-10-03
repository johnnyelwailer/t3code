import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project, ThreadShell } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";
import { isProviderNativeSubagentThread, type T3TeamThreadFacts } from "@t3tools/contracts";
import { deriveThreadAwaitingParent } from "@t3tools/shared/t3team-threadAwaitingParent";
import {
  deriveThreadRunState,
  isTerminalThreadRunState,
} from "@t3tools/shared/t3team-threadRunStatus";
import {
  mergeProjectThreadLocalState,
  upsertProjectThreadLocalState,
} from "~/t3team/t3team-threadToolContext";
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

/**
 * A live thread as the t3team store sees it: from its V2 SHELL plus the fork thread facts.
 *
 * Every field here is on the shell or in `facts` (`t3team.subscribeThreadFacts`). Reading a
 * thread's projection per row would open a `subscribeThread` stream for every listed thread.
 * Parent placement comes from V2 lineage (`subagent` children) and the server's placement route,
 * and persists in local state.
 */
export function mapLiveThreadToProjectThread(
  thread: ThreadShell,
  projectIdOverride: string = thread.projectId,
  facts?: T3TeamThreadFacts,
  hasLiveChildren = false,
): ProjectThread {
  const runState = deriveLiveThreadRunState(thread, hasLiveChildren);
  return {
    id: thread.id,
    projectId: projectIdOverride,
    ...(thread.lineage.relationshipToParent === "subagent" && thread.lineage.parentThreadId
      ? { parentThreadId: thread.lineage.parentThreadId }
      : {}),
    title: thread.title,
    lastMessageAt: thread.latestRun?.completedAt ?? thread.updatedAt ?? thread.createdAt,
    createdAt: thread.createdAt,
    // "error" is CURRENT state: a failed latest run, until the next run moves it on. Background
    // work that outlives the run reads as running; pending subagent work reads as waiting.
    status: thread.archivedAt
      ? "completed"
      : thread.runtime?.status === "failed"
        ? "error"
        : runState === "running"
          ? "running"
          : "idle",
    // The REAL settle state: sub-run rosters' "Settled (N)" fold keys off this, never off
    // `status !== "running"` — a fresh terminal child is not settled.
    settled: thread.settledOverride === "settled",
    waitingOnChildren: runState === "waiting",
    // A question docked in this thread's composer; drives the parent-side pending indicator.
    pendingUserInput: thread.hasPendingUserInput,
    // A plan-mode thread that presented its plan and stopped: the parent owes it a decision.
    ...(deriveThreadAwaitingParent({
      interactionMode: thread.interactionMode,
      latestRunStatus: thread.latestRun?.status ?? "idle",
      hasActionableProposedPlan: thread.hasActionableProposedPlan,
    })
      ? { awaitingParent: true }
      : {}),
    ...(facts ? mapThreadFacts(facts) : {}),
  };
}

function deriveLiveThreadRunState(thread: ThreadShell, hasLiveChildren: boolean) {
  return deriveThreadRunState({
    status: thread.runtime?.status ?? "idle",
    pendingBackgroundTasks: thread.pendingBackgroundTasks,
    hasLiveChildren,
  });
}

/** Fork-owned facts (workflow pills, child status, activity label, retention). */
function mapThreadFacts(facts: T3TeamThreadFacts): Partial<ProjectThread> {
  return {
    ...(facts.retention ? { retention: facts.retention } : {}),
    ...(facts.sleepingUntil ? { sleepingUntil: facts.sleepingUntil } : {}),
    ...(facts.workflowRunStatus
      ? {
          workflowRunStatus: {
            ...facts.workflowRunStatus,
            runId: facts.workflowRunStatus.runId ?? "",
          },
        }
      : {}),
    ...(facts.childStatus !== undefined ? { childStatus: facts.childStatus } : {}),
    ...(facts.childStatusUpdatedAt !== undefined
      ? { childStatusUpdatedAt: facts.childStatusUpdatedAt }
      : {}),
    ...(facts.activityLabel !== undefined ? { activityLabel: facts.activityLabel } : {}),
  };
}

/**
 * Whether a live thread belongs in the t3team thread lists. Provider-native subagents (a
 * provider's own helper threads) stay hidden, as in upstream's sidebar; app-owned children
 * (`delegate_task`, workflow children) are listed and nest under their parent.
 */
export function isListedLiveThread(thread: ThreadShell): boolean {
  return !isProviderNativeSubagentThread({
    lineage: thread.lineage,
    creationSource: thread.source.creationSource,
  });
}

export function mergeProjectThreads(threads: ReadonlyArray<ProjectThread>): ProjectThread[] {
  const byId = new Map<string, ProjectThread>();

  for (const thread of threads) {
    byId.set(thread.id, mergeProjectThreadLocalState(byId.get(thread.id), thread));
  }

  return [...byId.values()];
}

/** A live child keeps its parent "Waiting": not archived, not settled, own run not terminal. */
function isLiveChild(thread: ThreadShell): boolean {
  if (thread.archivedAt) return false;
  if (thread.settledOverride === "settled") return false;
  return !isTerminalThreadRunState(deriveLiveThreadRunState(thread, false));
}

export function syncLiveThreadMetadataToLocalState(input: {
  threads: ReadonlyArray<ProjectThread>;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
  liveThreads: ReadonlyArray<ThreadShell>;
  factsByThreadId?: ReadonlyMap<string, T3TeamThreadFacts>;
}): ProjectThread[] {
  let nextThreads = input.threads as ProjectThread[];
  const parentByChildId = new Map(
    input.threads.flatMap((thread) =>
      thread.parentThreadId ? [[thread.id, thread.parentThreadId] as const] : [],
    ),
  );

  // Pass 1: collect the parents that have a live child — from V2 lineage or the persisted
  // placement relation (a workflow child placed under its launch thread).
  const liveChildParentIds = new Set<string>();
  for (const liveThread of input.liveThreads) {
    const parentId =
      parentByChildId.get(liveThread.id) ??
      (liveThread.lineage.relationshipToParent === "subagent"
        ? (liveThread.lineage.parentThreadId ?? undefined)
        : undefined);
    if (parentId !== undefined && isLiveChild(liveThread)) {
      liveChildParentIds.add(parentId);
    }
  }

  // Pass 2: map and upsert with the waiting fact folded into the run state, so a parent's flag
  // reflects children that appear later in the live list. Absence clears on the next sync.
  for (const liveThread of input.liveThreads) {
    nextThreads = upsertProjectThreadLocalState(
      nextThreads,
      mapLiveThreadToProjectThread(
        liveThread,
        resolveStoredProjectId(liveThread.projectId, input.storedProjects, input.liveProjects),
        input.factsByThreadId?.get(liveThread.id),
        liveChildParentIds.has(liveThread.id),
      ),
    );
  }

  return nextThreads;
}
