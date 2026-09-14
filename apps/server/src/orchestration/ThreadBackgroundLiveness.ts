// @effect-diagnostics globalDate:off -- recordTaskLiveness stamps wall-clock
// time on every live transition; the registry is a pure in-memory recorder
// (no Effect clock plumbing for a hot-path stamp).
/**
 * ThreadBackgroundLivenessService - in-memory per-thread background liveness
 * for the sidebar status pill.
 *
 * The turn can settle while native background work runs on (subagent fleets,
 * workflow runs, Monitor watch loops); the shell previously showed nothing.
 * Ingestion records task lifecycle transitions and the shell query reads the
 * derived state at mapping time — no persistence, no migration. After a
 * server restart the registry is empty until new task events arrive, which
 * matches reality: orphaned background work is not live.
 *
 * Entries also EXPIRE, per task, after THREAD_BACKGROUND_LIVENESS_TTL_MS of
 * silence (#475): if a task's terminal notification is lost the entry would
 * otherwise survive until session death or restart, and every consumer of
 * this registry (the engine's decide-time auto-settle gate, the opted-in
 * settle gate, the shell pill, the child-settle sweep's candidacy) would be
 * pinned by the stranded entry forever. A bounded registry at the source
 * releases all of them at once, instead of a per-consumer bound — a
 * duplicate state ladder.
 * "monitoring" is reserved for watch loops (monitor tasks and background
 * shells) when they are the ONLY live work; any agent work presents as
 * "working".
 *
 * @module ThreadBackgroundLivenessService
 */
import { INERT_TASK_TYPES, MONITOR_TASK_TYPES } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type ThreadBackgroundLiveness = "working" | "monitoring" | null;

interface ThreadLivenessState {
  readonly agents: Map<string, number>;
  readonly monitors: Map<string, number>;
}

/**
 * Stranded-entry escape hatch (#475): a task with no lifecycle transition
 * (task.started/progress/updated) for this long reads as NOT live. Deliberate
 * tradeoff, visible here for future readers: a genuinely live task that
 * emits zero lifecycle rows for longer than this is read as not-live. Live
 * subagents and watch loops stream rows while they run (they are the feed),
 * so sustained silence beyond the bound means stranded, not live — and the
 * bound is what releases a stranded entry for every consumer at once.
 */
export const THREAD_BACKGROUND_LIVENESS_TTL_MS = 30 * 60 * 1_000;

function livenessTtlEnvMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs;
}

export function threadBackgroundLivenessTtlMs(): number {
  return livenessTtlEnvMs("T3TEAM_THREAD_LIVENESS_TTL_MS", THREAD_BACKGROUND_LIVENESS_TTL_MS);
}

// Classification sets are the shared contracts copies (MONITOR_TASK_TYPES:
// watch loops — monitor tasks plus background shells, which in practice are
// PR babysitting/log tails since pacing sleeps complete inside the turn;
// INERT_TASK_TYPES: plan-mode bookkeeping) so this registry, ingestion's
// agentKind stamp, and the client fold can never drift apart.

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "interrupted",
]);

export class ThreadBackgroundLivenessService extends Context.Service<
  ThreadBackgroundLivenessService,
  {
    /**
     * Feed one task lifecycle transition. taskType may be absent on
     * synthesized rows (workflow members, Codex children) — those count as
     * agents. agentId marks a task launched from inside a subagent: its
     * internal shells are covered by the owning agent's liveness, but a
     * NESTED AGENT (agentId + agent-flavored taskType) still counts — it
     * can outlive its parent and must keep the thread Working.
     */
    readonly recordTaskLiveness: (input: {
      readonly threadId: string;
      readonly taskId: string;
      readonly taskType: string | undefined;
      readonly status: string | undefined;
      readonly kind: "started" | "progress" | "updated" | "completed";
      readonly agentId?: string | undefined;
    }) => void;

    /** Session death orphans all of a thread's background work. */
    readonly clearThreadLiveness: (threadId: string) => void;

    /**
     * Two-state vocabulary by design: any live agent work is "working";
     * "monitoring" only when watch loops are the ONLY live work.
     */
    readonly getThreadBackgroundLiveness: (threadId: string) => ThreadBackgroundLiveness;
  }
>()("t3/orchestration/ThreadBackgroundLiveness/ThreadBackgroundLivenessService") {}

export function make(
  options: {
    readonly ttlMs?: number;
    readonly now?: () => number;
  } = {},
): ThreadBackgroundLivenessService["Service"] {
  const ttlMs = options.ttlMs ?? threadBackgroundLivenessTtlMs();
  const now = options.now ?? (() => Date.now());
  const stateByThreadId = new Map<string, ThreadLivenessState>();

  const stateFor = (threadId: string): ThreadLivenessState => {
    const existing = stateByThreadId.get(threadId);
    if (existing) {
      return existing;
    }
    const created: ThreadLivenessState = { agents: new Map(), monitors: new Map() };
    stateByThreadId.set(threadId, created);
    return created;
  };

  // Classification is per-transition, not sticky: a task first seen without
  // a taskType may later reveal itself as a shell, become inert, or turn out
  // to be agent-owned. Every path drops any prior entry for the taskId so a
  // stale bucket assignment can't pin the thread's status (review finding).
  const drop = (threadId: string, taskId: string) => {
    const state = stateByThreadId.get(threadId);
    if (!state) {
      return;
    }
    state.agents.delete(taskId);
    state.monitors.delete(taskId);
    if (state.agents.size === 0 && state.monitors.size === 0) {
      stateByThreadId.delete(threadId);
    }
  };

  return {
    recordTaskLiveness: (input) => {
      const taskType = input.taskType;
      if (taskType !== undefined && INERT_TASK_TYPES.has(taskType)) {
        drop(input.threadId, input.taskId);
        return;
      }
      // A subagent's internal non-agent work (its own shells/monitors) is
      // covered by the owning agent's liveness. Nested agents fall through:
      // they can outlive their parent (review finding).
      if (
        input.agentId !== undefined &&
        (taskType === undefined || MONITOR_TASK_TYPES.has(taskType))
      ) {
        drop(input.threadId, input.taskId);
        return;
      }

      // Idle counts as not-live: a resting (resumable) Codex child isn't
      // doing anything, and an all-idle fleet must not pin Working.
      const terminal =
        input.kind === "completed" ||
        input.status === "idle" ||
        (input.status !== undefined && TERMINAL_STATUSES.has(input.status));
      if (terminal) {
        drop(input.threadId, input.taskId);
        return;
      }

      // Status-free progress and metadata updates are not restarts. A delayed
      // row after idle must not put the task back in the live set (#7128).
      if ((input.kind === "progress" || input.kind === "updated") && input.status === undefined) {
        const existing = stateByThreadId.get(input.threadId);
        const stillLive =
          existing !== undefined &&
          (existing.agents.has(input.taskId) || existing.monitors.has(input.taskId));
        if (!stillLive) {
          return;
        }
      }

      drop(input.threadId, input.taskId);
      const state = stateFor(input.threadId);
      const bucket =
        taskType !== undefined && MONITOR_TASK_TYPES.has(taskType) ? state.monitors : state.agents;
      bucket.set(input.taskId, now());
    },

    clearThreadLiveness: (threadId) => {
      stateByThreadId.delete(threadId);
    },

    getThreadBackgroundLiveness: (threadId) => {
      const state = stateByThreadId.get(threadId);
      if (!state) {
        return null;
      }
      // #475: prune tasks silent past the TTL, lazily, on the read. Reads
      // happen on every shell mapping and decide-time gate check, so a
      // stranded entry can never outlive the bound — no timer needed.
      const cutoff = now() - ttlMs;
      for (const [taskId, lastSeenMs] of state.agents) {
        if (lastSeenMs <= cutoff) {
          state.agents.delete(taskId);
        }
      }
      for (const [taskId, lastSeenMs] of state.monitors) {
        if (lastSeenMs <= cutoff) {
          state.monitors.delete(taskId);
        }
      }
      if (state.agents.size === 0 && state.monitors.size === 0) {
        stateByThreadId.delete(threadId);
        return null;
      }
      if (state.agents.size > 0) {
        return "working";
      }
      if (state.monitors.size > 0) {
        return "monitoring";
      }
      return null;
    },
  };
}

export const layer = Layer.effect(ThreadBackgroundLivenessService, Effect.sync(make));
