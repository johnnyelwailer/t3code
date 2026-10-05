/**
 * Shared types, constants, and op vocabulary for the `t3team.thread.children`
 * meta tool. Kept free of behavior so the op modules can import the shapes
 * without a cycle.
 *
 * Only ops without an upstream equivalent remain: child lifecycle reads and
 * control (list / status / wait / stop) are upstream `t3_thread_list`,
 * `task_status`, `t3_thread_wait`, `task_cancel` / `t3_thread_interrupt`.
 *
 * @module t3team-toolBrokerChildrenTypes
 */
import type { OrchestrationV2ThreadShell, ProjectId, ThreadId } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

export const T3TEAM_CHILDREN_TOOL_ID = "t3team.thread.children";

export const T3TEAM_CHILD_OPS = [
  "watch",
  "unwatch",
  "sweep",
  "drain",
  "environments",
  "help",
] as const;
export type T3TeamChildOp = (typeof T3TEAM_CHILD_OPS)[number];

/** Ops that moved to upstream tools; a call names the replacement instead of failing blind. */
export const T3TEAM_CHILD_REMOVED_OPS: Readonly<Record<string, string>> = {
  list: "use t3_thread_list (includeSubagents: true) — children carry parentThreadId",
  status: "use task_status with the taskId delegate_task returned, or t3_thread_read",
  wait:
    "delegated children wake this thread automatically when they finish; end the turn, or " +
    "use delegate_task mode:'wait' / t3_thread_wait when the result is needed in this turn",
  stop: "use task_cancel (taskId) or t3_thread_interrupt (threadId)",
  close: "nothing to do: a delegated task is done once its result is available",
};

/**
 * Outcome of the `drain` op: the caller's OWN inter-agent mailbox, claimed now
 * instead of waiting for the boundary drain.
 */
export type ChildrenDrainOutcome =
  | {
      readonly state: "dispatched";
      readonly delivered: number;
      readonly subjects: ReadonlyArray<string>;
    }
  | {
      readonly state: "queued";
      readonly queued: number;
      readonly subjects: ReadonlyArray<string>;
      readonly note: string;
    }
  | {
      readonly state: "held";
      readonly held: number;
      readonly subjects: ReadonlyArray<string>;
      readonly note: string;
    };

/** Durable silence-watch registration, provided by the silence-watch layer. */
export interface ChildrenSilenceWatchPort {
  /** Upserts the (watcher, target) watch; `timeoutMs` omitted = the watch default. */
  readonly register: (input: {
    readonly watcherThreadId: ThreadId;
    readonly targetThreadId: ThreadId;
    readonly targetTitle: string;
    readonly timeoutMs: number | undefined;
  }) => Effect.Effect<{ readonly watchId: string; readonly timeoutMs: number }, string>;
  readonly cancel: (input: {
    readonly watcherThreadId: ThreadId;
    readonly targetThreadId: ThreadId;
  }) => Effect.Effect<{ readonly cancelled: number }, string>;
}

export interface EnvironmentBindingSummary {
  readonly environmentId: string;
  readonly label?: string;
  readonly threadCount: number;
  readonly latestThreadAt: string;
}

export interface T3TeamChildrenToolDeps {
  readonly callerThreadId: ThreadId;
  readonly callerProjectId: ProjectId;
  /** This server's own EnvironmentId; `environments` marks it as the default target. */
  readonly localEnvironmentId?: string | undefined;
  /** A thread's V2 shell; undefined when missing or deleted. */
  readonly loadThreadShell: (
    threadId: ThreadId,
  ) => Effect.Effect<OrchestrationV2ThreadShell | undefined, string>;
  /** Every shell of a project, delegated (subagent) children included. */
  readonly listProjectThreadShells: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<OrchestrationV2ThreadShell>, string>;
  /** Settles one thread (`thread.settle`); settle guards still apply. */
  readonly settleThread: (threadId: ThreadId) => Effect.Effect<void, string>;
  /** Recorded cross-environment bindings (thread facts), newest first. */
  readonly listEnvironmentBindings: () => Effect.Effect<
    ReadonlyArray<EnvironmentBindingSummary>,
    string
  >;
  /** Absent when this host runs no inter-agent mailbox. */
  readonly drainOwnMailbox: (() => Effect.Effect<ChildrenDrainOutcome, string>) | undefined;
  /** Absent when this host runs no silence watch. */
  readonly silenceWatch: ChildrenSilenceWatchPort | undefined;
  readonly nowIso: () => string;
}

export type ChildrenArgs = {
  readonly op?: unknown;
  readonly thread_id?: unknown;
  readonly thread_ids?: unknown;
  readonly timeout?: unknown;
  readonly all_older_than_hours?: unknown;
  readonly op_name?: unknown;
};
