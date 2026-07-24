/**
 * Types and the message-upsert command builder shared by the workflow-engine broker (Epic 25
 * §Host wiring). The broker itself lives in `t3work-workflowEngineBroker.ts`; this module
 * carries the per-run dependency shape, the pending-ask record the registry/durability layer
 * mirrors, and the payload shapes the SDK's thread verbs put on the wire.
 */

import {
  CommandId,
  MessageId,
  type ModelSelection,
  type OrchestrationCommand,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type T3workMessageExt,
  ThreadId,
} from "@t3tools/contracts";

import type { AskAffordance, ModelSelection as WorkflowModelSelection } from "@t3work/sdk";

import type { T3workWorkflowEngineRegistryShape } from "./t3work-workflowEngineRegistry.ts";
import type { WorkflowStepActivityEmitter } from "./t3work-workflowEngineStepActivities.ts";

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

/**
 * Write-through to the durable `workflow_runs` record. The host implements this over
 * {@link import("./persistence/Services/WorkflowRuns.ts").WorkflowRunRepository}; absent (SDK
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
  /** Mark the run `completed` and clear the pending ask. */
  readonly recordCompleted: () => Promise<void>;
  /** Mark the run `failed` and clear the pending ask. */
  readonly recordFailed: () => Promise<void>;
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
  readonly registry: T3workWorkflowEngineRegistryShape;
  /** Run an orchestration command (the launch builds this from the captured runtime). */
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
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
   * Live step-status sink (UX slice 1 — "no black box"): each fired primitive emits a
   * `workflow.step` thread activity on the launch thread. Best-effort by construction; absent
   * on the SDK fs path and in minimal tests.
   */
  readonly stepActivities?: WorkflowStepActivityEmitter;
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
}

export interface ThreadCreatePayload {
  readonly threadId: string;
  readonly name?: string;
  readonly model?: WorkflowModelSelection;
  /** Provider-agnostic thinking level; see `resolveWorkflowChildModel`. */
  readonly effort?: import("@t3work/sdk").AgentEffort;
  /** Omitted is ephemeral, preserving one-shot agent() as a hidden child. */
  readonly retention?: "ephemeral" | "retained";
}
export interface ThreadTurnPayload {
  readonly threadId: string;
  readonly prompt: string;
  readonly model?: WorkflowModelSelection;
  /** Short human-facing status label, separate from the provider prompt. */
  readonly label?: string;
  /** Provider-agnostic thinking level; see `resolveWorkflowChildModel`. */
  readonly effort?: import("@t3work/sdk").AgentEffort;
  /** The author's structured data, named by the SDK and journaled as structure; the host
   * serializes it into the turn text (`workflowTurnText`). Absent on older journals. */
  readonly attachments?: ReadonlyArray<import("@t3work/sdk").NamedAttachment>;
}
export interface ThreadMessagePayload {
  readonly threadId: string;
  readonly recipient: "agent" | "user";
  readonly text: string;
  readonly widget?: {
    readonly title: string;
    readonly widgetCode: string;
    readonly format?: "html" | "svg";
    readonly loadingMessages?: ReadonlyArray<string>;
  };
}
export interface UserInputPayload {
  readonly threadId: string;
  readonly question: string;
  /** Short human-facing status label, separate from the user question. */
  readonly label?: string;
  /** Serializable descriptor of the reply affordance, derived from the ask's schema by the
   * SDK (`schemaToAffordance`). Absent on payloads from older journals → treated as text. */
  readonly affordance?: AskAffordance;
  /** External-resource refs to render as cards on the decision message. */
  readonly attachments?: ReadonlyArray<unknown>;
}
/**
 * The `model.resolve` envelope payload: the author's provider ladder (`{ models: [...] }`), in
 * wire form. Resolved host-side against the live registry; the chosen selection is the
 * primitive's journaled reply, so replays reuse it instead of re-probing.
 */
export interface ModelResolvePayload {
  readonly entries: ReadonlyArray<import("@t3work/sdk").ModelCascadeWireEntry>;
}
/** The `wait.until` envelope payload: the wall-clock deadline (epoch millis) the run sleeps to. */
export interface WaitUntilPayload {
  readonly deadline: number;
}

export function messageUpsert(
  deps: WorkflowEngineBrokerDeps,
  threadId: string,
  role: "user" | "system",
  text: string,
  t3workExt?: T3workMessageExt,
): OrchestrationCommand {
  return {
    type: "thread.message.upsert",
    commandId: CommandId.make(`t3work-wf:msg:${deps.newId()}`),
    threadId: ThreadId.make(threadId),
    message: {
      messageId: MessageId.make(deps.newId()),
      role,
      text,
      turnId: null,
      streaming: false,
      ...(t3workExt === undefined ? {} : { t3workExt }),
    },
    createdAt: deps.nowIso(),
  };
}
