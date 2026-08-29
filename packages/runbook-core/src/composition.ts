/**
 * Host-neutral workflow composition primitives.
 *
 * These operations are intentionally small adapters over the generic durable primitive seat. A
 * host supplies the runtime, progress callbacks, budget accounting, and the optional inline child
 * executor; no provider, catalog, loader, or product policy belongs here.
 */

import { createArtifactEmitter, type ArtifactInput, type ArtifactRecord } from "./artifacts.ts";
import { WorkflowError } from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

export type PipelineStage = (prev: unknown, item: unknown, index: number) => Promise<unknown>;

export interface WorkflowBudget {
  readonly total: number;
  readonly spent: () => number;
  readonly remaining: () => number;
}

/**
 * Reported once for each `parallel()` thunk or `pipeline()` item whose chain rejects. The branch
 * itself still resolves to `null` in the array `parallel`/`pipeline` return — see their own
 * bodies below — this is purely the side-channel that makes a swallowed rejection VISIBLE and
 * attributable instead of leaving no trace anywhere. A host with no live step-activity concept
 * (a bare test harness, say) simply never wires {@link WorkflowPrimitivesDeps.onCompositionBranchFailed}
 * and the branch behaves exactly as before this existed.
 */
export interface CompositionBranchFailure {
  readonly compositionKind: "parallel" | "pipeline";
  /** 0-based position of the failing thunk (`parallel`) or item (`pipeline`) among its siblings. */
  readonly index: number;
  readonly total: number;
  /** `pipeline` only: which stage (0-based) in the item's chain threw. */
  readonly stageIndex?: number;
  readonly stageTotal?: number;
  /**
   * A truthful description of the rejection reason — the real `Error#message` when there is one,
   * and an honest description of the thrown value's shape otherwise. NEVER fabricated: a reason
   * with no message says so instead of inventing text (see {@link describeRejectionReason}).
   */
  readonly error: string;
}

/**
 * Describe a rejected thunk's reason for {@link CompositionBranchFailure.error} without ever
 * inventing a message the caller did not actually throw.
 */
function describeRejectionReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message.length > 0 ? reason.message : `${reason.name} was thrown with no message`;
  }
  if (typeof reason === "string") {
    return reason.length > 0 ? reason : "an empty string was thrown";
  }
  if (typeof reason === "number" || typeof reason === "boolean" || typeof reason === "bigint") {
    return String(reason);
  }
  if (reason === undefined) return "undefined was thrown (no error message)";
  if (reason === null) return "null was thrown (no error message)";
  try {
    return `a non-Error value was thrown: ${JSON.stringify(reason)}`;
  } catch {
    return "a non-Error, non-serializable value was thrown (no error message)";
  }
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
  /** Host entropy for artifact ids — must NOT be the journaled uuid primitive. */
  readonly hostUuid: () => string;
  /** Host timestamp formatter for artifact records. */
  readonly nowIso: () => string;
  /**
   * Runs `ref` inline, in THIS run's journal sequence. Absent only for a host that does not
   * support sub-workflows at all; a nested child now receives one too, because nesting is no
   * longer capped at one level — see {@link createWorkflowPrimitives}'s `workflow`. `opts` carries
   * this invocation's caller-declared effect-interception handlers, if any (see `workflow` above).
   */
  readonly runSubWorkflow?: (ref: Ref, args: unknown, opts?: Opts) => Promise<unknown>;
  /**
   * Live observation of a `parallel()`/`pipeline()` branch that rejected — see
   * {@link CompositionBranchFailure}. Optional and best-effort: `parallel`/`pipeline` await it
   * (so a host that turns it into a durable dispatch can guarantee ordering against the run's own
   * terminal activity) but swallow whatever it throws, exactly like every other live status pip
   * in this codebase — a lost report must never turn a swallowed rejection into a hard failure.
   */
  readonly onCompositionBranchFailed?: (failure: CompositionBranchFailure) => void | Promise<void>;
}

/**
 * A durable suspension is a CONTROL SIGNAL, not a branch rejection: it means the ask has not been
 * answered yet, so turning it into `null` would hand the body a fabricated result for a step that
 * never ran — the same silent-wrong-answer shape a body's own `catch (e)` used to produce. Both
 * compositions therefore re-raise it instead of reporting-and-nulling.
 *
 * This does NOT change the documented contract that a REJECTED thunk resolves to `null`: a
 * suspension is not a rejection, and every real error still takes the reporting path below.
 */
function rethrowIfSuspension(reason: unknown): void {
  if (reason instanceof WorkflowSuspended) throw reason;
}

/** Await the optional branch-failure hook, swallowing whatever IT throws — see the field's doc. */
async function reportCompositionBranchFailure(
  deps: Pick<WorkflowPrimitivesDeps, "onCompositionBranchFailed">,
  failure: CompositionBranchFailure,
): Promise<void> {
  try {
    await deps.onCompositionBranchFailed?.(failure);
  } catch {
    // Reporting a swallowed rejection must never itself produce a NEW one.
  }
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
            thunks.map((thunk, index) =>
              Promise.resolve()
                .then(thunk)
                .then(
                  (value) => value,
                  async (reason) => {
                    rethrowIfSuspension(reason);
                    await reportCompositionBranchFailure(deps, {
                      compositionKind: "parallel",
                      index,
                      total: thunks.length,
                      error: describeRejectionReason(reason),
                    });
                    return null;
                  },
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
              let stageIndex = 0;
              try {
                let prev: unknown = item;
                for (const stage of stages) {
                  prev = await stage(prev, item, index);
                  stageIndex += 1;
                }
                return prev;
              } catch (reason) {
                rethrowIfSuspension(reason);
                await reportCompositionBranchFailure(deps, {
                  compositionKind: "pipeline",
                  index,
                  total: items.length,
                  stageIndex,
                  stageTotal: stages.length,
                  error: describeRejectionReason(reason),
                });
                return null;
              }
            }),
          ),
        ),
      decodeRecorded: (recorded) => recorded as unknown[],
    });

  /**
   * Runs a sub-workflow INLINE, in this run's own journal sequence — deliberately NOT through
   * `callPrimitive`/`runBlackBoxed` the way `parallel` and `pipeline` are. The child's primitive
   * calls take their `seq` from the parent's counter, in the order they happen: that makes the
   * child durably suspendable (no in-memory resolvers), replay-deterministic, and resumable
   * part-way. `parallel`/`pipeline` keep their black boxes because their branches are NOT
   * sequential — their calls would interleave differently on replay.
   *
   * The cost, stated plainly: editing a sub-workflow's body shifts every later `seq` in the
   * parent, so an already-suspended run will not line up on resume. The engine detects that and
   * fails loudly (`assertJournalMatch` / gap drift) — the same contract that governs editing the
   * parent body itself. Depth is uncapped; recursion is refused by the host's cycle guard.
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
