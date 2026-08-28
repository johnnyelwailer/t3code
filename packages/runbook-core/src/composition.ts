/**
 * Host-neutral workflow composition primitives.
 *
 * These operations are intentionally small adapters over the generic durable primitive seat. A
 * host supplies the runtime, progress callbacks, budget accounting, and the optional inline child
 * executor; no provider, catalog, loader, or product policy belongs here.
 */

import { createArtifactEmitter, type ArtifactInput, type ArtifactRecord } from "./artifacts.ts";
import { WorkflowError } from "./errors.ts";
import type { WorkflowReference } from "./engine.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

export type PipelineStage = (prev: unknown, item: unknown, index: number) => Promise<unknown>;

export interface WorkflowBudget {
  readonly total: number;
  readonly spent: () => number;
  readonly remaining: () => number;
}

export interface WorkflowPrimitives<
  Ref extends WorkflowReference = WorkflowReference,
  Opts = unknown,
> {
  readonly parallel: <R>(thunks: ReadonlyArray<() => Promise<R>>) => Promise<Array<R | null>>;
  readonly pipeline: (
    items: ReadonlyArray<unknown>,
    ...stages: PipelineStage[]
  ) => Promise<unknown[]>;
  /**
   * `opts` is opaque at this host-neutral layer — it is handed straight to `runSubWorkflow`
   * unexamined, because only the host adapter (t3team-sdk) knows what a caller can put in it
   * (currently: a per-`HandleKind` effect-interception handler map). Additive: every existing
   * two-argument call keeps compiling and behaving identically, since an absent `opts` reaches
   * `runSubWorkflow` as `undefined`.
   */
  readonly workflow: (ref: Ref, args?: unknown, opts?: Opts) => Promise<unknown>;
  readonly wait: (durationMs: number) => Promise<void>;
  readonly budget: WorkflowBudget;
  readonly phase: (title: string) => void;
  readonly log: (message: string) => void;
  /**
   * Emit a typed, durable artifact into the run journal (the `artifact` primitive). The
   * returned record is stable across replay — a resumed run sees the same artifact ids.
   */
  readonly emit: (input: ArtifactInput) => Promise<ArtifactRecord>;
}

export interface WorkflowPrimitivesDeps<
  Ref extends WorkflowReference = WorkflowReference,
  Opts = unknown,
> {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly spent: () => number;
  readonly hostNow: () => number;
  readonly budgetTotal: number;
  readonly onPhase: (title: string) => void;
  readonly onLog: (message: string) => void;
  /** Journaled uuid — artifact ids mint through this so replay is deterministic. */
  readonly uuid: () => string;
  /** Host timestamp formatter for artifact records. */
  readonly nowIso: () => string;
  /**
   * Runs `ref` inline, in THIS run's journal sequence. Absent only for a host that does not
   * support sub-workflows at all; a nested child now receives one too, because nesting is no
   * longer capped at one level — see {@link createWorkflowPrimitives}'s `workflow`. `opts` carries
   * this invocation's caller-declared effect-interception handlers, if any (see `workflow` above).
   */
  readonly runSubWorkflow?: (ref: Ref, args: unknown, opts?: Opts) => Promise<unknown>;
}

export function createWorkflowPrimitives<
  Ref extends WorkflowReference = WorkflowReference,
  Opts = unknown,
>(deps: WorkflowPrimitivesDeps<Ref, Opts>): WorkflowPrimitives<Ref, Opts> {
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

  /**
   * Runs a sub-workflow INLINE, in this run's own journal sequence — deliberately NOT through
   * `callPrimitive`/`runBlackBoxed` the way `parallel` and `pipeline` are.
   *
   * Sealing a sub-run inside one black-boxed journal entry cost it three things a root body has,
   * and there was no way for an author to get them back:
   *
   *   1. **It could not durably suspend.** Inside a black box an ask gets an in-memory resolver
   *      (`handlesDispatch.ts`), so a question asked from a sub-workflow only resolved while the
   *      process stayed alive. A restart lost it. That made `askUser` a root-body-only verb by
   *      accident rather than by design.
   *   2. **It was not replay-deterministic.** `now`/`random`/`uuid` skip the journal inside a black
   *      box (`durableRuntimePrimitive.ts`), so a resumed run drew fresh values one level down.
   *   3. **It could not be resumed part-way.** The whole sub-run was one entry: either replayed
   *      wholesale or re-executed wholesale.
   *
   * Running it inline fixes all three at once, because the child's primitive calls simply take
   * their `seq` from the parent's counter, in the order they happen. That order is deterministic
   * for the same reason the parent's own is: one body, executing sequentially. `parallel` and
   * `pipeline` keep their black boxes precisely because their branches are NOT sequential — their
   * calls would interleave differently on replay and the journal would mismatch.
   *
   * The cost, stated plainly: editing a sub-workflow's body shifts every later `seq` in the
   * parent, so an already-suspended run will not line up on resume. The engine detects that and
   * fails loudly (`assertJournalMatch` / gap drift) rather than silently doing the wrong thing —
   * the same contract that already governs editing the parent body itself.
   *
   * Depth is no longer capped. Recursion is refused by the host's own cycle guard, which sees the
   * ref stack; this layer stays free of that policy.
   */
  const workflow = (ref: Ref, args?: unknown, opts?: Opts): Promise<unknown> => {
    const runSub = deps.runSubWorkflow;
    if (runSub === undefined) {
      throw new WorkflowError(
        "workflow() is not available in this run: the host supplied no sub-workflow executor.",
      );
    }
    return runSub(ref, args, opts);
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
    emit: createArtifactEmitter(deps).emit,
  };
}
