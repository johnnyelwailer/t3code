/**
 * In-memory registry for live workflow-engine runs (Epic 25 §Host wiring). A run that fires
 * an ask verb (`thread.turn` / `user.input`) durably suspends; the host parks it and resumes
 * it when the reply lands. This registry is the park lot:
 *
 *   • `runs` maps a runId → its `resume(correlationId, reply)` closure (created by the launch,
 *     which captures the workflow ref + run options so a resume re-runs `resumeWorkflow`).
 *   • `pendingByThread` maps a threadId → the ask currently awaiting a reply on that thread.
 *     The broker records it when it fires an ask; the reactor reads it when a turn completes
 *     or the user replies, then calls the run's `resume`.
 *
 * State is process-local, but it is no longer the source of truth: it is a hot index rebuilt
 * at boot from the durable `workflow_runs` table (Epic 25 §Open question 2 — DB-backed
 * durability). The launch + broker write the run record + pending ask through to SQLite, and
 * `rehydrateSuspendedWorkflowRuns` re-registers every suspended run here on startup, so a run
 * parked on a multi-hour ask survives a restart. A run is suspended on at most one ask per
 * thread at a time, so a single `pendingByThread` slot per thread is sufficient.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";

import type { AskAffordance } from "@t3team/sdk";

/** Which ask kind a thread is parked on — selects the event that resolves it. */
export type WorkflowPendingKind = "thread.turn" | "user.input";

export interface WorkflowPendingAsk {
  readonly runId: string;
  readonly correlationId: string;
  readonly kind: WorkflowPendingKind;
  /** The `user.input` ask's affordance descriptor, so the resolve route can reject a
   * structured value that does not fit the offered choices BEFORE posting the reply. Hot-index
   * only (not persisted): after a restart-rehydration it is absent and the route check degrades
   * gracefully — the SDK still schema-validates the reply on resume. */
  readonly affordance?: AskAffordance;
  /**
   * The attribution stamped on this step's prompt, reused to stamp the assistant messages that
   * ANSWER it — so a step's prompt and its answer carry the same run id, step id and label, and a
   * client can collapse both under one label. Hot-index only, like `affordance`: a run rehydrated
   * after a restart has no author, and its answers stay unattributed rather than guessing a label.
   */
  readonly author?: T3TeamMessageWorkflowAuthor;
  /** Black-boxed composition asks settle in-memory inside the still-running composition. */
  readonly resolveLive?: (reply: unknown) => Promise<void>;
  /** Settle an in-memory waiter when its owning run is cancelled. */
  readonly cancelLive?: () => void;
  /**
   * Present when this step's turn was INTERRUPTED by a host restart and the ask was rehydrated
   * from the `workflow_runs` row (`turn_retries`, migration 052) — never set by the live broker.
   * It carries the journaled re-drive count so a no-text settle re-drives the step instead of
   * failing the run, up to the bounded budget (see t3team-workflowEngineTurnRetry.ts). A live
   * step that simply says nothing still fails the run.
   */
  readonly turnRetries?: number;
  /**
   * Set when the host has ARMED a re-drive of this step (t3team-workflowEngineTurnRetry.ts) and the
   * re-driven turn has not started yet. Until a session write with a live turn lands, idle/dead
   * session writes on the thread are the OLD turn's tail — the session-level transient retry
   * (`t3team-threadTransientTurnRetry.ts`) re-writes the dead session with its "Retrying (n/N)"
   * reason ~300 ms after the turn ends — and must not be read as another failed turn, or every
   * such write would burn one re-drive of the budget (GHE #403 review). Hot-index only.
   */
  readonly redriveArmed?: boolean;
}

export interface WorkflowRegisteredRun {
  /** Append the resolved reply for `correlationId` and replay the run to completion or its
   * next suspension. Created by the launch so it carries the ref + options. */
  readonly resume: (correlationId: string, reply: unknown) => Promise<void>;
  /** Prevent a detached controller from publishing a later terminal result. */
  readonly cancel: () => void;
  /**
   * Fail the run from the HOST side, for a condition the body can never observe because its ask
   * will never be answered — an agent turn that ended without a single word of reply text being
   * the case that motivated it. Resolving such an ask with `""` instead would let a workflow
   * propose an empty artifact and report success.
   *
   * Optional so registrations made directly in tests keep compiling; callers must fall back.
   */
  readonly fail?: (error: unknown) => Promise<void>;
}

export interface T3TeamWorkflowEngineRegistryShape {
  readonly registerRun: (runId: string, run: WorkflowRegisteredRun) => void;
  readonly deleteRun: (runId: string) => void;
  readonly getRun: (runId: string) => WorkflowRegisteredRun | undefined;
  readonly cancelRun: (runId: string) => void;
  readonly removePendingForRun: (runId: string) => void;
  readonly registerOwnership: (runId: string, launchThreadId: string | undefined) => void;
  readonly registerMasterStop: (runId: string, stop: () => Promise<void>) => void;
  readonly masterStopForRun: (runId: string) => Promise<void>;
  readonly runsOwnedByThread: (threadId: string) => ReadonlyArray<string>;
  readonly registerChildThread: (runId: string, threadId: string) => void;
  readonly childThreadsForRun: (runId: string) => ReadonlyArray<string>;
  /** The launching thread of the run that spawned `threadId`, when it is a live run's child.
   * Lets `start_child` parent a session spawned from inside a workflow child thread under the
   * (visible) launching thread instead of a hidden ephemeral workflow thread. */
  readonly launchThreadForChildThread: (threadId: string) => string | undefined;
  readonly setPending: (threadId: string, pending: WorkflowPendingAsk) => void;
  /** Read and remove the pending ask for a thread (first matching reply wins). */
  readonly takePending: (threadId: string) => WorkflowPendingAsk | undefined;
  /** Read the pending ask for a thread WITHOUT removing it. The reactor uses this to decide
   * whether a streaming assistant delta is worth buffering (only while a turn is awaited on the
   * thread); it must not consume the ask, which is settled by the matching `streaming: false`
   * event. */
  readonly peekPending: (threadId: string) => WorkflowPendingAsk | undefined;
}

export class T3TeamWorkflowEngineRegistry extends Context.Service<
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryShape
>()("t3/t3team-workflowEngineRegistry/T3TeamWorkflowEngineRegistry") {}

/** Build a fresh in-memory registry shape. Exported so tests can drive the real launch/resume
 * machinery without booting the Effect layer. */
export function makeWorkflowEngineRegistry(): T3TeamWorkflowEngineRegistryShape {
  const runs = new Map<string, WorkflowRegisteredRun>();
  const pendingByThread = new Map<string, WorkflowPendingAsk>();
  const launchThreadByRun = new Map<string, string>();
  const childThreadsByRun = new Map<string, Set<string>>();
  const masterStopByRun = new Map<string, () => Promise<void>>();

  return {
    registerRun: (runId, run) => {
      runs.set(runId, run);
    },
    deleteRun: (runId) => {
      runs.delete(runId);
      launchThreadByRun.delete(runId);
      childThreadsByRun.delete(runId);
      masterStopByRun.delete(runId);
    },
    getRun: (runId) => runs.get(runId),
    cancelRun: (runId) => {
      runs.get(runId)?.cancel();
      runs.delete(runId);
      for (const [threadId, pending] of pendingByThread) {
        if (pending.runId === runId) {
          pendingByThread.delete(threadId);
          pending.cancelLive?.();
        }
      }
      launchThreadByRun.delete(runId);
      masterStopByRun.delete(runId);
    },
    removePendingForRun: (runId) => {
      for (const [threadId, pending] of pendingByThread) {
        if (pending.runId === runId) pendingByThread.delete(threadId);
      }
    },
    registerOwnership: (runId, launchThreadId) => {
      if (launchThreadId !== undefined) launchThreadByRun.set(runId, launchThreadId);
    },
    registerMasterStop: (runId, stop) => masterStopByRun.set(runId, stop),
    masterStopForRun: (runId) => masterStopByRun.get(runId)?.() ?? Promise.resolve(),
    runsOwnedByThread: (threadId) =>
      [...launchThreadByRun.entries()]
        .filter(([, owner]) => owner === threadId)
        .map(([runId]) => runId),
    registerChildThread: (runId, threadId) => {
      const children = childThreadsByRun.get(runId) ?? new Set<string>();
      children.add(threadId);
      childThreadsByRun.set(runId, children);
    },
    childThreadsForRun: (runId) => [...(childThreadsByRun.get(runId) ?? [])],
    launchThreadForChildThread: (threadId) => {
      for (const [runId, children] of childThreadsByRun) {
        if (children.has(threadId)) return launchThreadByRun.get(runId);
      }
      return undefined;
    },
    setPending: (threadId, pending) => {
      pendingByThread.set(threadId, pending);
    },
    takePending: (threadId) => {
      const pending = pendingByThread.get(threadId);
      if (pending !== undefined) pendingByThread.delete(threadId);
      return pending;
    },
    peekPending: (threadId) => pendingByThread.get(threadId),
  };
}

export const T3TeamWorkflowEngineRegistryLive = Layer.effect(
  T3TeamWorkflowEngineRegistry,
  Effect.sync(makeWorkflowEngineRegistry),
);
