/**
 * Thread run status — one compact, provider-agnostic "what is this thread doing
 * right now" record derived from an orchestration V2 thread shell.
 *
 * Shared by the server's child-thread tools (list/status) and the web parent
 * rows, so tools and UI read the SAME shell fields through one function and can
 * never disagree about whether a thread is running, done or dead.
 *
 *   running   — own work is active (an activity-owning run, a non-terminal
 *               latest run) or non-subagent background work is still pending
 *   completed — the latest run settled cleanly
 *   failed    — the latest run failed
 *   aborted   — the latest run was interrupted or cancelled
 *   idle      — nothing has run yet, or the latest run was rolled back
 *   waiting   — own work settled but child work is still live: a pending
 *               `subagent` background task, or `hasLiveChildren` from the
 *               caller (app-owned children the shell does not list)
 *
 * Own failed/aborted outranks child liveness, and `waiting` only replaces a
 * would-be completed/idle. `awaitingUserInput` / `awaitingParent` are facts
 * riding alongside the state, never states of their own.
 *
 * @module threadRunStatus
 */
import type {
  OrchestrationV2ShellThreadStatus,
  OrchestrationV2ThreadShell,
  ThreadEnvironmentBinding,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { deriveThreadAwaitingParent } from "./t3team-threadAwaitingParent.ts";

export type ThreadRunState = "running" | "idle" | "failed" | "completed" | "aborted" | "waiting";

/** Terminal states: the thread's own work has settled. `waiting` is NOT terminal. */
export function isTerminalThreadRunState(state: ThreadRunState): boolean {
  return state === "completed" || state === "failed" || state === "aborted";
}

export interface ThreadRunStateInput {
  readonly status: OrchestrationV2ShellThreadStatus;
  readonly activityRunStatus?: OrchestrationV2ThreadShell["activityRunStatus"];
  readonly pendingBackgroundTasks?: ReadonlyArray<{ readonly kind: string }> | undefined;
  readonly hasLiveChildren?: boolean | undefined;
}

export function deriveThreadRunState(input: ThreadRunStateInput): ThreadRunState {
  if (input.activityRunStatus !== undefined && input.activityRunStatus !== null) return "running";
  switch (input.status) {
    case "preparing":
    case "queued":
    case "starting":
    case "running":
    case "waiting":
      return "running";
    case "failed":
      return "failed";
    case "interrupted":
    case "cancelled":
      return "aborted";
  }
  const pending = input.pendingBackgroundTasks ?? [];
  // Background work outlives the run: it reads as running after the run settled.
  if (pending.some((task) => task.kind !== "subagent")) return "running";
  if (input.hasLiveChildren === true || pending.some((task) => task.kind === "subagent")) {
    return "waiting";
  }
  return input.status === "completed" ? "completed" : "idle";
}

export type ThreadRunStatusInput = Pick<
  OrchestrationV2ThreadShell,
  | "id"
  | "title"
  | "modelSelection"
  | "branch"
  | "worktreePath"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "settledOverride"
  | "settledAt"
  | "interactionMode"
  | "hasActionableProposedPlan"
  | "pendingRuntimeRequest"
> &
  Partial<
    Pick<
      OrchestrationV2ThreadShell,
      | "activityRunStatus"
      | "latestRunStartedAt"
      | "latestRunCompletedAt"
      | "pendingBackgroundTasks"
      | "lastError"
    >
  > & {
    readonly hasLiveChildren?: boolean | undefined;
    /** Fork thread facts merged in by the caller (t3team.subscribeThreadFacts). */
    readonly childStatus?: string | null | undefined;
    readonly environment?: ThreadEnvironmentBinding | null | undefined;
  };

export interface ThreadRunStatus {
  readonly threadId: string;
  readonly title: string;
  readonly state: ThreadRunState;
  readonly provider: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  /** The latest run's status (`idle` when no run exists). */
  readonly latestRunStatus: OrchestrationV2ShellThreadStatus;
  readonly latestRunStartedAt: string | null;
  readonly latestRunCompletedAt: string | null;
  readonly lastError: string | null;
  /** Background-only summary of meaningful child work, when present. */
  readonly childStatus: string | null;
  readonly settledOverride: string | null;
  readonly settledAt: string | null;
  /** A runtime request (question/approval) is waiting on the user in this thread. */
  readonly awaitingUserInput: boolean;
  /** Plan-mode thread settled with an unimplemented plan: the parent owes a decision. */
  readonly awaitingParent: boolean;
  readonly environment: ThreadEnvironmentBinding | null;
}

const iso = (value: DateTime.Utc | null | undefined): string | null =>
  value === null || value === undefined ? null : DateTime.formatIso(value);

export function deriveThreadRunStatus(shell: ThreadRunStatusInput): ThreadRunStatus {
  return {
    threadId: shell.id,
    title: shell.title,
    state: deriveThreadRunState(shell),
    provider: shell.modelSelection ? String(shell.modelSelection.instanceId) : null,
    model: shell.modelSelection ? shell.modelSelection.model : null,
    createdAt: DateTime.formatIso(shell.createdAt),
    lastActivityAt: DateTime.formatIso(shell.updatedAt),
    branch: shell.branch,
    worktreePath: shell.worktreePath,
    latestRunStatus: shell.status,
    latestRunStartedAt: iso(shell.latestRunStartedAt),
    latestRunCompletedAt: iso(shell.latestRunCompletedAt),
    lastError: shell.lastError ?? null,
    childStatus: shell.childStatus ?? null,
    settledOverride: shell.settledOverride,
    settledAt: iso(shell.settledAt),
    awaitingUserInput: shell.pendingRuntimeRequest !== null,
    awaitingParent: deriveThreadAwaitingParent({
      interactionMode: shell.interactionMode,
      latestRunStatus: shell.status,
      hasActionableProposedPlan: shell.hasActionableProposedPlan,
    }),
    environment: shell.environment ?? null,
  };
}
