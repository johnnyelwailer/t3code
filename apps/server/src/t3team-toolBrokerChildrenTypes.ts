/**
 * Shared types, constants, and op vocabulary for the `t3team.thread.children`
 * meta tool (GHE #55). Kept free of behavior so the op modules can import the
 * shapes without a cycle.
 *
 * @module t3team-toolBrokerChildrenTypes
 */
import { ProjectId, type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type ThreadRunStatusInput } from "@t3tools/shared/t3team-threadRunStatus";
import { type ThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";

export const T3TEAM_CHILDREN_TOOL_ID = "t3team.thread.children";

export const T3TEAM_CHILD_OPS = [
  "list",
  "status",
  "wait",
  "watch",
  "unwatch",
  "stop",
  "close",
  "sweep",
  "help",
] as const;
export type T3TeamChildOp = (typeof T3TEAM_CHILD_OPS)[number];

export const T3TEAM_CHILD_WAIT_OUTCOMES = ["terminal", "completed", "failed"] as const;
export type T3TeamChildWaitOutcome = (typeof T3TEAM_CHILD_WAIT_OUTCOMES)[number];

// ── Structural input shapes (decoupled from the full projection types) ─────

export type ChildThreadShell = ThreadRunStatusInput;

export interface ChildThreadMessage {
  readonly role: string;
  readonly text?: string | null;
  readonly createdAt?: string | null;
}

export interface ChildThreadActivity {
  readonly kind: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly payload: unknown;
}

export interface ChildThreadDetail extends ThreadRunStatusInput {
  readonly projectId: string;
  readonly activities: ReadonlyArray<ChildThreadActivity>;
  readonly messages: ReadonlyArray<ChildThreadMessage>;
}

export interface T3TeamChildrenToolDeps {
  readonly callerThreadId: ThreadIdType;
  readonly callerProjectId: ProjectId;
  readonly loadThreadDetail: (
    threadId: ThreadIdType,
  ) => Effect.Effect<ChildThreadDetail | undefined, string>;
  readonly loadThreadShell: (
    threadId: ThreadIdType,
  ) => Effect.Effect<ChildThreadShell | undefined, string>;
  readonly listProjectThreadShells: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<ChildThreadShell>, string>;
  /**
   * The active child thread ids of a parent, derived from the durable
   * parent/child relation (handoff.created parentThreadId / handoff.started
   * childThreadId) rather than the parent's own activity load — so a
   * coordinator with a large child fleet lists every child, matching the
   * sidebar/fork section. Newest first. (GHE #178)
   */
  readonly listChildThreadIds: (
    parentThreadId: ThreadIdType,
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<string>, string>;
  /** Append a durable activity to a thread (wait registration, close marker). */
  readonly appendActivity: (
    threadId: ThreadIdType,
    input: { readonly kind: string; readonly summary: string; readonly payload: unknown },
  ) => Effect.Effect<void, string>;
  /** Interrupt a thread's active turn (the stop op). */
  readonly interruptTurn: (threadId: ThreadIdType) => Effect.Effect<void, string>;
  /**
   * Settle a thread (the sweep op): dispatches the durable `thread.settle`
   * command. The decider's invariants still apply — running sessions and
   * blocked-on-user work refuse the settle and surface as sweep errors.
   */
  readonly settleThread: (threadId: ThreadIdType) => Effect.Effect<void, string>;
  readonly nowIso: () => string;
  readonly newId: () => string;
}

export type ChildrenArgs = {
  readonly op?: unknown;
  readonly thread_id?: unknown;
  readonly on?: unknown;
  readonly timeout?: unknown;
  readonly all?: unknown;
  readonly all_older_than_hours?: unknown;
  readonly thread_ids?: unknown;
  readonly include_settled?: unknown;
  readonly reason?: unknown;
  readonly op_name?: unknown;
};

export type { ThreadRunState };
