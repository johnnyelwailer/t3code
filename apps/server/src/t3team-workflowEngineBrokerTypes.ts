/**
 * Types shared by the workflow-engine broker (Epic 25 §Host wiring). The broker itself lives in
 * `t3team-workflowEngineBroker.ts`; this module carries the per-run dependency shape and the
 * pending-ask record the registry/durability layer mirrors. The payload shapes the SDK's verbs
 * put on the wire live in `t3team-workflowEngineBrokerPayloads.ts` (re-exported here).
 */

import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";

import type {
  SignalRegisterPayload,
  SignalWaitAnyPayload,
  SignalWaitPayload,
} from "./t3team-workflowEngineBrokerPayloads.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";

/** The ask a run is parked on, as the broker knows it when it fires (thread + correlation). */
export interface WorkflowEnginePendingAsk {
  readonly threadId: string;
  readonly correlationId: string;
  readonly kind: "thread.turn" | "user.input";
}

/** The timer a run parks on when it fires `waitUntil` (Epic 27): the `waitUntil` correlation
 * the scheduler resolves on fire, plus the wake deadline (epoch millis) it arms a timer for. */
export interface WorkflowEngineSleep {
  readonly correlationId: string;
  readonly deadline: number;
}

/** The event a run parks on when it fires `signal.waitFor` (GHE #332): the `signal.wait`
 * correlation the delivery port resolves on delivery, plus the awaited `(signal, key)` it joins
 * on. A signal park has no thread (no thread column) and no deadline (no timer). */
export interface WorkflowEngineWatch {
  readonly correlationId: string;
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly watchSignalName: string;
  readonly watchSignalKey: string;
  /** An any-wait park (`signal.waitAny`): every branch, in branch order; the fields above then
   * name branch 0. Absent for a single-signal park. */
  readonly branches?: ReadonlyArray<SignalWaitPayload>;
}

/**
 * Write-through to the durable `workflow_runs` record. The host implements this over
 * {@link import("./persistence/WorkflowRuns.ts").WorkflowRunRepository}; absent (SDK
 * fs path / tests) the run is purely in-memory.
 */
export interface WorkflowRunLifecycle {
  /** Insert the initial `running` row (called once at launch). */
  readonly recordRunning: () => Promise<void>;
  /** A parked continuation was claimed and is executing its next atomic segment. */
  /** Wait for a fair execution permit; false means the queued run was cancelled. */
  readonly recordActive: () => Promise<boolean>;
  /** Yield after one dispatched primitive so another workflow may take the next turn. */
  readonly releaseActive: () => void;
  /** Flip to `suspended` + record the ask the run parked on (driven by the broker). */
  readonly recordSuspended: (pending: WorkflowEnginePendingAsk) => Promise<void>;
  /** Flip to `sleeping` + record the wake deadline the run parked on (Epic 27; driven by the
   * broker when the body fires `waitUntil`). */
  readonly recordSleeping: (sleep: WorkflowEngineSleep) => Promise<void>;
  /** Flip to `watching` + record the awaited `(signal, key)` + correlation the run parked on
   * (GHE #332; driven by the broker when the body fires `signal.waitFor`). Absent on
   * pre-signal hosts — the park is then purely in-memory (fs path / tests). */
  readonly recordWatching?: (watch: WorkflowEngineWatch) => Promise<void>;
  /** Mark the run `completed` and clear the pending ask. */
  readonly recordCompleted: () => Promise<void>;
  /** Mark the run `failed`, clear the pending ask, and persist the agent-facing failure detail
   * (migration 044) so `status`/`resume` can report WHY without a journal read. With
   * `retainPending` the pending ask is KEPT (GHE #403): the failure is the host's verdict on an
   * unanswered step, not a body fault, and `resume` re-drives that step from the retained ask. */
  readonly recordFailed: (detail?: {
    readonly reason: string;
    readonly step: string;
    readonly retainPending?: boolean;
  }) => Promise<void>;
  /** Crash-recovery: if this correlation still owns a sleeping or newly-claimed active row and
   * its reply was already journaled, mark it failed. Correlation pinning protects newer work. */
  readonly orphanIfSleeping: (correlationId: string) => Promise<void>;
}

export interface WorkflowEngineBrokerDeps {
  readonly runId: string;
  readonly launchThreadId?: string;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  /** The thread operations the run performs (`T3TeamWorkflowHost`). */
  readonly host: WorkflowHostPort;
  readonly newId: () => string;
  readonly nowIso: () => string;
  /**
   * Durably persist the pending ask (status=suspended + pending columns) before the side
   * effect dispatches, so a restart finds the parked run in the DB. The in-memory
   * `registry.setPending` is still set for the live reactor's hot lookups; this mirrors it to
   * the source of truth. No-op (undefined) on the fs/in-memory path.
   */
  readonly recordPending?: (pending: WorkflowEnginePendingAsk) => Promise<void>;
  /**
   * Durably record a clock park (status=sleeping + `wake_at` + the `waitUntil` correlation)
   * before the run suspends, so the scheduler finds it on boot (Epic 27). Mirrors
   * {@link recordPending} for the timer wake source. No-op (undefined) on the fs/in-memory path.
   */
  readonly recordSleeping?: (sleep: WorkflowEngineSleep) => Promise<void>;
  /**
   * Durably record the awaited `(signal, key)` + correlation (status=watching) before the run
   * parks, so the delivery port finds it on boot (GHE #332). Mirrors {@link recordSleeping} for
   * the event wake source. No-op (undefined) on the fs/in-memory path.
   */
  readonly recordWatching?: (watch: WorkflowEngineWatch) => Promise<void>;
  /**
   * Durably upsert the run × source-instance binding FACT for the `signal.register` verb
   * (GHE #332) — the reconciler derives the desired live source set from these rows. One-way:
   * it never settles a resolver. No-op (undefined) on the fs/in-memory path.
   */
  readonly recordSignalRegistration?: (reg: SignalRegisterPayload) => Promise<void>;
  /**
   * Drain a matching OPEN entry from the durable signal inbox for a `signal.wait` (GHE #332):
   * an event that landed while no run was parked on this `(signal, key)` is journaled here, and
   * a later wait takes it (first-wins). Returns the entry's payload, or `undefined` when no
   * entry is open (the run then parks until the delivery port resolves it).
   */
  readonly drainSignalWait?: (wait: SignalWaitPayload) => Promise<unknown | undefined>;
  /**
   * The any-wait drain (`signal.waitAny`): take the OLDEST open inbox entry matching any branch
   * (first-wins) and report which branch it answers, or `undefined` when none is open.
   */
  readonly drainSignalWaitAny?: (
    wait: SignalWaitAnyPayload,
  ) => Promise<{ readonly index: number; readonly payload: unknown } | undefined>;
  /**
   * Live step-status sink (UX slice 1 — "no black box"): each fired primitive emits a
   * `workflow.step` thread activity on the launch thread. Best-effort by construction; absent
   * on the SDK fs path and in minimal tests.
   */
  readonly stepActivities?: WorkflowStepActivityEmitter;
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
  /**
   * The authored `phase()` group the workflow body is currently inside, read live at the moment
   * a primitive is SENT. Backed by a cell the controller updates from `WorkflowRunOptions.onPhase`
   * (see `t3team-workflowEngineController.ts`); replay-safe because the SDK re-executes the whole
   * body from the top on every resume, so this cell is reconstructed identically every time —
   * `phase()` needs no journaling of its own (unlike `now()`, it reads no host entropy/clock; its
   * value is fully determined by already-deterministic source, so replaying the same statements
   * in the same order reproduces it). Absent in tests/older wiring — `step()` then stamps nothing.
   */
  readonly currentPhase?: () => string | undefined;
}

export type {
  ModelResolvePayload,
  SignalRegisterPayload,
  SignalWaitAnyPayload,
  SignalWaitPayload,
  ThreadCreatePayload,
  ThreadMessagePayload,
  ThreadTurnPayload,
  UserInputPayload,
  WaitUntilPayload,
} from "./t3team-workflowEngineBrokerPayloads.ts";
