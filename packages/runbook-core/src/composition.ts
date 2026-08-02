/**
 * Host-neutral workflow composition primitives.
 *
 * These operations are intentionally small adapters over the generic durable primitive seat. A
 * host supplies the runtime, progress callbacks, budget accounting, and the optional inline child
 * executor; no provider, catalog, loader, or product policy belongs here.
 */

import { WorkflowError } from "./errors.ts";
import type { WorkflowReference } from "./engine.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

export type PipelineStage = (prev: unknown, item: unknown, index: number) => Promise<unknown>;

export interface WorkflowBudget {
  readonly total: number;
  readonly spent: () => number;
  readonly remaining: () => number;
}

export interface WorkflowPrimitives<Ref extends WorkflowReference = WorkflowReference> {
  readonly parallel: <R>(thunks: ReadonlyArray<() => Promise<R>>) => Promise<Array<R | null>>;
  readonly pipeline: (
    items: ReadonlyArray<unknown>,
    ...stages: PipelineStage[]
  ) => Promise<unknown[]>;
  readonly workflow: (ref: Ref, args?: unknown) => Promise<unknown>;
  readonly wait: (durationMs: number) => Promise<void>;
  readonly budget: WorkflowBudget;
  readonly phase: (title: string) => void;
  readonly log: (message: string) => void;
}

export interface WorkflowPrimitivesDeps<Ref extends WorkflowReference = WorkflowReference> {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly spent: () => number;
  readonly hostNow: () => number;
  readonly budgetTotal: number;
  readonly onPhase: (title: string) => void;
  readonly onLog: (message: string) => void;
  /** Absent for a nested child, which preserves the existing one-level nesting guard. */
  readonly runSubWorkflow?: (ref: Ref, args: unknown) => Promise<unknown>;
}

export function createWorkflowPrimitives<Ref extends WorkflowReference = WorkflowReference>(
  deps: WorkflowPrimitivesDeps<Ref>,
): WorkflowPrimitives<Ref> {
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

  const workflow = (ref: Ref, args?: unknown): Promise<unknown> => {
    const runSub = deps.runSubWorkflow;
    if (runSub === undefined) {
      throw new WorkflowError(
        "workflow() supports one level of nesting only: a sub-workflow cannot call workflow() again.",
      );
    }
    return deps.callPrimitive<unknown>({
      kind: "workflow",
      refId: "workflow",
      args: { workflowName: ref.path ?? ref.absolutePath, subArgs: args ?? null },
      exec: () => deps.runBlackBoxed(() => runSub(ref, args)),
      decodeRecorded: (recorded) => recorded,
    });
  };

  const wait = async (durationMs: number): Promise<void> => {
    const { deadline } = await deps.callPrimitive<{ readonly deadline: number }>({
      kind: "wait",
      refId: "wait",
      args: { durationMs },
      exec: async () => ({ deadline: deps.hostNow() + durationMs }),
      decodeRecorded: (recorded) => recorded as { readonly deadline: number },
    });
    const remaining = deadline - deps.hostNow();
    if (remaining > 0) await deps.sleep(remaining);
  };

  const budget: WorkflowBudget = {
    total: deps.budgetTotal,
    spent: () => deps.spent(),
    remaining: () => deps.budgetTotal - deps.spent(),
  };

  return {
    parallel,
    pipeline,
    workflow,
    wait,
    budget,
    phase: deps.onPhase,
    log: deps.onLog,
  };
}
