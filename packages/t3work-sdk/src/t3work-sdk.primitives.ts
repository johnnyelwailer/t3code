/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The composition workflow-body primitives bound as globals: the black-boxed `parallel` /
 * `pipeline` / `workflow`, the durable timer `wait`, the `budget` accumulator, and the
 * cosmetic `phase` / `log`. (The LLM verb `agent` lives in `t3work-sdk.threadPrimitives.ts`
 * now — it is `spawnThread().askAgent()` and routes through the Handle/broker seam, not a
 * separate dispatcher.)
 *
 * Every primitive that produces durable state routes through the runtime's generic
 * `callPrimitive` seat, so replay returns the recorded result without re-sleeping or
 * re-running a sub-workflow. The composition primitives run their thunks inside
 * `runBlackBoxed` so the calls inside them are NOT individually journaled — the composition
 * primitive is the journal boundary (a documented Stage-1 tradeoff).
 */

import * as NodeTimersPromises from "node:timers/promises";

import { WorkflowError } from "./t3work-sdk.errors.ts";
import type { WorkflowBudget } from "./t3work-sdk.primitiveTypes.ts";
import type * as T from "./t3work-sdk.types.ts";

/** A single `pipeline` stage: receives the previous stage's result, the original item, and
 * the item index. Stage 1's `prev` is the item itself. */
export type PipelineStage = (prev: unknown, item: unknown, index: number) => Promise<unknown>;

/** The globals this module binds into the workflow body. */
export interface WorkflowPrimitives {
  readonly parallel: <R>(thunks: ReadonlyArray<() => Promise<R>>) => Promise<Array<R | null>>;
  readonly pipeline: (
    items: ReadonlyArray<unknown>,
    ...stages: PipelineStage[]
  ) => Promise<unknown[]>;
  readonly workflow: (ref: T.WorkflowRef, args?: unknown) => Promise<unknown>;
  readonly wait: (durationMs: number) => Promise<void>;
  readonly budget: WorkflowBudget;
  readonly phase: (title: string) => void;
  readonly log: (message: string) => void;
}

/** Dependencies the primitives close over — supplied by the workflow runner. */
export interface WorkflowPrimitivesDeps {
  readonly callPrimitive: <R>(call: T.PrimitiveCall<R>) => Promise<R>;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly spentAgentTokens: () => number;
  readonly hostNow: () => number;
  readonly budgetTotal: number;
  readonly onPhase: (title: string) => void;
  readonly onLog: (message: string) => void;
  /** Run a sub-workflow body to completion. Absent for a nested workflow, which makes
   * `workflow()` throw (one level of nesting only). */
  readonly runSubWorkflow?: (ref: T.WorkflowRef, args: unknown) => Promise<unknown>;
}

export function createWorkflowPrimitives(deps: WorkflowPrimitivesDeps): WorkflowPrimitives {
  const parallel = <R>(thunks: ReadonlyArray<() => Promise<R>>): Promise<Array<R | null>> =>
    deps.callPrimitive<Array<R | null>>({
      kind: "parallel",
      refId: "parallel",
      args: { thunkCount: thunks.length },
      exec: () =>
        deps.runBlackBoxed(() =>
          Promise.all(
            thunks.map((thunk) =>
              Promise.resolve()
                .then(thunk)
                .then(
                  (value) => value,
                  () => null,
                ),
            ),
          ),
        ),
      decodeRecorded: (recorded) => recorded as Array<R | null>,
    });

  const pipeline = (
    items: ReadonlyArray<unknown>,
    ...stages: PipelineStage[]
  ): Promise<unknown[]> =>
    deps.callPrimitive<unknown[]>({
      kind: "pipeline",
      refId: "pipeline",
      args: { itemCount: items.length, stageCount: stages.length },
      exec: () =>
        deps.runBlackBoxed(() =>
          Promise.all(
            items.map(async (item, index) => {
              try {
                let prev: unknown = item;
                for (const stage of stages) prev = await stage(prev, item, index);
                return prev;
              } catch {
                return null;
              }
            }),
          ),
        ),
      decodeRecorded: (recorded) => recorded as unknown[],
    });

  const workflow = (ref: T.WorkflowRef, args?: unknown): Promise<unknown> => {
    const runSub = deps.runSubWorkflow;
    if (runSub === undefined) {
      throw new WorkflowError(
        "workflow() supports one level of nesting only: a sub-workflow cannot call workflow() again.",
      );
    }
    return deps.callPrimitive<unknown>({
      kind: "workflow",
      refId: "workflow",
      args: { workflowName: ref.path, subArgs: args ?? null },
      exec: () => deps.runBlackBoxed(() => runSub(ref, args)),
      decodeRecorded: (recorded) => recorded,
    });
  };

  const wait = async (durationMs: number): Promise<void> => {
    const { deadline } = await deps.callPrimitive<{ readonly deadline: number }>({
      kind: "wait",
      refId: "wait",
      args: { durationMs },
      // Live: pin the deadline off the host clock (real time advances, so this is not the
      // journaled `now`). Replay returns the recorded deadline without re-running this.
      exec: async () => ({ deadline: deps.hostNow() + durationMs }),
      decodeRecorded: (recorded) => recorded as { readonly deadline: number },
    });
    const remaining = deadline - deps.hostNow();
    if (remaining > 0) await NodeTimersPromises.setTimeout(remaining);
  };

  const budget: WorkflowBudget = {
    total: deps.budgetTotal,
    spent: () => deps.spentAgentTokens(),
    remaining: () => deps.budgetTotal - deps.spentAgentTokens(),
  };

  return {
    parallel,
    pipeline,
    workflow,
    wait,
    budget,
    phase: (title: string) => deps.onPhase(title),
    log: (message: string) => deps.onLog(message),
  };
}
