/** T3Team's typed adapter over the host-neutral workflow composition primitives. */

import * as NodeTimersPromises from "node:timers/promises";

import {
  createWorkflowPrimitives as createGenericWorkflowPrimitives,
  type PipelineStage,
  type WorkflowPrimitives as GenericWorkflowPrimitives,
  type WorkflowPrimitivesDeps as GenericWorkflowPrimitivesDeps,
} from "@runbook/core/composition";

import type * as T from "./t3team-sdk.types.ts";

export type { PipelineStage };
export type WorkflowPrimitives = GenericWorkflowPrimitives<T.WorkflowRef, T.WorkflowInvokeOpts>;

export interface WorkflowPrimitivesDeps {
  readonly callPrimitive: <R>(call: T.PrimitiveCall<R>) => Promise<R>;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly spentAgentTokens: () => number;
  readonly hostNow: () => number;
  readonly budgetTotal: number;
  readonly onPhase: (title: string) => void;
  readonly onLog: (message: string) => void;
  /** Journaled uuid — artifact ids mint through this so replay is deterministic. */
  readonly uuid: () => string;
  /** Host timestamp formatter for artifact records. */
  readonly nowIso: () => string;
  readonly runSubWorkflow?: (
    ref: T.WorkflowRef,
    args: unknown,
    opts?: T.WorkflowInvokeOpts,
  ) => Promise<unknown>;
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
    uuid: deps.uuid,
    nowIso: deps.nowIso,
    ...(deps.runSubWorkflow === undefined ? {} : { runSubWorkflow: deps.runSubWorkflow }),
  });
}
