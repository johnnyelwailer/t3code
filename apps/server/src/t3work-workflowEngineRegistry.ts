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

import type { AskAffordance } from "@t3work/sdk";

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
  /** Black-boxed composition asks settle in-memory inside the still-running composition. */
  readonly resolveLive?: (reply: unknown) => Promise<void>;
}

export interface WorkflowRegisteredRun {
  /** Append the resolved reply for `correlationId` and replay the run to completion or its
   * next suspension. Created by the launch so it carries the ref + options. */
  readonly resume: (correlationId: string, reply: unknown) => Promise<void>;
}

export interface T3workWorkflowEngineRegistryShape {
  readonly registerRun: (runId: string, run: WorkflowRegisteredRun) => void;
  readonly deleteRun: (runId: string) => void;
  readonly getRun: (runId: string) => WorkflowRegisteredRun | undefined;
  readonly setPending: (threadId: string, pending: WorkflowPendingAsk) => void;
  /** Read and remove the pending ask for a thread (first matching reply wins). */
  readonly takePending: (threadId: string) => WorkflowPendingAsk | undefined;
  /** Read the pending ask for a thread WITHOUT removing it. The reactor uses this to decide
   * whether a streaming assistant delta is worth buffering (only while a turn is awaited on the
   * thread); it must not consume the ask, which is settled by the matching `streaming: false`
   * event. */
  readonly peekPending: (threadId: string) => WorkflowPendingAsk | undefined;
}

export class T3workWorkflowEngineRegistry extends Context.Service<
  T3workWorkflowEngineRegistry,
  T3workWorkflowEngineRegistryShape
>()("t3/t3work-workflowEngineRegistry/T3workWorkflowEngineRegistry") {}

/** Build a fresh in-memory registry shape. Exported so tests can drive the real launch/resume
 * machinery without booting the Effect layer. */
export function makeWorkflowEngineRegistry(): T3workWorkflowEngineRegistryShape {
  const runs = new Map<string, WorkflowRegisteredRun>();
  const pendingByThread = new Map<string, WorkflowPendingAsk>();

  return {
    registerRun: (runId, run) => {
      runs.set(runId, run);
    },
    deleteRun: (runId) => {
      runs.delete(runId);
    },
    getRun: (runId) => runs.get(runId),
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

export const T3workWorkflowEngineRegistryLive = Layer.effect(
  T3workWorkflowEngineRegistry,
  Effect.sync(makeWorkflowEngineRegistry),
);
