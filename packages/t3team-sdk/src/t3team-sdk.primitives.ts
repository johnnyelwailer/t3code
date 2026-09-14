/** T3Team's typed adapter over the host-neutral workflow composition primitives. */

import * as NodeTimersPromises from "node:timers/promises";

import {
  createWorkflowPrimitives as createGenericWorkflowPrimitives,
  type CompositionBranchFailure,
  type PipelineStage,
  type WorkflowPrimitives as GenericWorkflowPrimitives,
  type WorkflowPrimitivesDeps as GenericWorkflowPrimitivesDeps,
} from "@runbook/core/composition";

import type * as T from "./t3team-sdk.types.ts";

export type { PipelineStage, CompositionBranchFailure };
export type WorkflowPrimitives = GenericWorkflowPrimitives<T.WorkflowRef, T.WorkflowInvokeOpts>;

export interface WorkflowPrimitivesDeps {
  readonly callPrimitive: <R>(call: T.PrimitiveCall<R>) => Promise<R>;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly spentAgentTokens: () => number;
  readonly hostNow: () => number;
  readonly budgetTotal: number;
  readonly onPhase: (title: string) => void;
  readonly onLog: (message: string) => void;
  /** Host entropy for artifact ids — must NOT be the journaled uuid primitive. */
  readonly hostUuid: () => string;
  /** Host timestamp formatter for artifact records. */
  readonly nowIso: () => string;
  readonly runSubWorkflow?: (
    ref: T.WorkflowRef,
    args: unknown,
    opts?: T.WorkflowInvokeOpts,
  ) => Promise<unknown>;
  /** Live observation of a `parallel()`/`pipeline()` branch that rejected — see the generic
   * `WorkflowPrimitivesDeps.onCompositionBranchFailed` this forwards to. */
  readonly onCompositionBranchFailed?: (failure: CompositionBranchFailure) => void | Promise<void>;
}

export function createWorkflowPrimitives(deps: WorkflowPrimitivesDeps): WorkflowPrimitives {
  return createGenericWorkflowPrimitives<T.WorkflowRef, T.WorkflowInvokeOpts>({
    callPrimitive: deps.callPrimitive as GenericWorkflowPrimitivesDeps<
      T.WorkflowRef,
      T.WorkflowInvokeOpts
    >["callPrimitive"],
    runBlackBoxed: deps.runBlackBoxed,
    sleep: (durationMs) => NodeTimersPromises.setTimeout(durationMs).then(() => undefined),
    spent: deps.spentAgentTokens,
    hostNow: deps.hostNow,
    budgetTotal: deps.budgetTotal,
    onPhase: deps.onPhase,
    onLog: deps.onLog,
    hostUuid: deps.hostUuid,
    nowIso: deps.nowIso,
    ...(deps.runSubWorkflow === undefined ? {} : { runSubWorkflow: deps.runSubWorkflow }),
    ...(deps.onCompositionBranchFailed === undefined
      ? {}
      : { onCompositionBranchFailed: deps.onCompositionBranchFailed }),
  });
}
