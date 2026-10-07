/**
 * Host-neutral workflow composition primitives.
 *
 * These operations are intentionally small adapters over the generic durable primitive seat. A
 * host supplies the runtime, progress callbacks, budget accounting, and the optional inline child
 * executor; no provider, catalog, loader, or product policy belongs here.
 */

import { createArtifactEmitter, type ArtifactInput, type ArtifactRecord } from "./artifacts.ts";
import { WorkflowAborted, WorkflowError } from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

/** Limit active branches; omission keeps the existing unbounded fan-out. */
export interface CompositionOptions {
  /** A positive finite integer. Recorded in the composition's journal arguments. */
  readonly concurrency?: number;
}

export type PipelineStages = PipelineStage[] | [...PipelineStage[], CompositionOptions];

/** Stage values are workflow-defined; retain explicitly typed callbacks at this untyped boundary. */
export type PipelineStage = {
  stage(prev: unknown, item: unknown, index: number): unknown;
}["stage"];

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
  readonly parallel: <R>(
    thunks: ReadonlyArray<() => Promise<R>>,
    options?: CompositionOptions,
  ) => Promise<Array<R | null>>;
  readonly pipeline: (
    items: ReadonlyArray<unknown>,
    ...stages: PipelineStages
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
  /**
   * The run's first-class abort signal. Black-boxed branches skip the seat's per-primitive abort
   * check, so the bounded pool consults it before launching each queued branch and raises
   * {@link WorkflowAborted} — the same error the seat throws — instead of starting more work.
   */
  readonly abortSignal?: AbortSignal | undefined;
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
  // An abort is a control signal for the same reason: it settles the run, it is not a branch result.
  if (reason instanceof WorkflowSuspended || reason instanceof WorkflowAborted) throw reason;
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

/** FIFO workers share one cursor and write results at the original input index. */
async function runCompositionPool<R>(
  count: number,
  concurrency: number | undefined,
  abortSignal: AbortSignal | undefined,
  run: (index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < count) {
      const index = next++;
      try {
        if (abortSignal?.aborted === true) throw new WorkflowAborted();
        results[index] = await run(index);
      } catch (reason) {
        stopped = true;
        throw reason;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency ?? count, count) }, worker));
  return results;
}

const COMPOSITION_OPTION_KEYS: ReadonlySet<string> = new Set(["concurrency"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Validate an options argument; every misuse throws the same TypeError/WorkflowError family. */
function compositionConcurrency(options: unknown): number | undefined {
  if (options === undefined) return undefined;
  if (!isPlainObject(options)) {
    throw new TypeError("Composition options must be an object such as { concurrency: 2 }.");
  }
  for (const key of Object.keys(options)) {
    if (!COMPOSITION_OPTION_KEYS.has(key)) {
      throw new TypeError(
        `Unknown composition option '${key}'; supported options: ${[...COMPOSITION_OPTION_KEYS].join(", ")}.`,
      );
    }
  }
  const { concurrency } = options;
  if (
    concurrency !== undefined &&
    (!Number.isInteger(concurrency) || (concurrency as number) < 1)
  ) {
    throw new WorkflowError("Composition concurrency must be a positive finite integer.");
  }
  return concurrency as number | undefined;
}

export function createWorkflowPrimitives<
  Ref extends WorkflowReference = WorkflowReference,
  Opts = unknown,
>(deps: WorkflowPrimitivesDeps<Ref, Opts>): WorkflowPrimitives<Ref, Opts> {
  // Both compositions are async so every misuse (bad options, bad stages) REJECTS the same way.
  // Inputs are snapshotted at call time: a caller mutating the array later must not change which
  // branches run once the bounded pool starts them lazily.
  const parallel = async <R>(
    thunkInput: ReadonlyArray<() => Promise<R>>,
    options?: CompositionOptions,
  ): Promise<Array<R | null>> => {
    const concurrency = compositionConcurrency(options);
    const thunks = [...thunkInput];
    return deps.callPrimitive<Array<R | null>>({
      kind: "parallel",
      refId: "parallel",
      args: { thunkCount: thunks.length, ...(concurrency === undefined ? {} : { concurrency }) },
      exec: () =>
        deps.runBlackBoxed(() =>
          runCompositionPool<R | null>(
            thunks.length,
            concurrency,
            deps.abortSignal,
            async (index) => {
              try {
                return await thunks[index]!();
              } catch (reason) {
                rethrowIfSuspension(reason);
                await reportCompositionBranchFailure(deps, {
                  compositionKind: "parallel",
                  index,
                  total: thunks.length,
                  error: describeRejectionReason(reason),
                });
                return null;
              }
            },
          ),
        ),
      decodeRecorded: (recorded) => recorded as Array<R | null>,
    });
  };

  const pipeline = async (
    itemInput: ReadonlyArray<unknown>,
    ...stagesAndOptions: PipelineStages
  ): Promise<unknown[]> => {
    // A trailing plain object is the options bag; any other trailing non-function is a mistake.
    const last: unknown = stagesAndOptions.at(-1);
    const hasOptions = isPlainObject(last);
    const concurrency = compositionConcurrency(hasOptions ? last : undefined);
    const stages = (hasOptions ? stagesAndOptions.slice(0, -1) : stagesAndOptions) as unknown[];
    if (!stages.every((stage) => typeof stage === "function")) {
      throw new TypeError(
        "pipeline() stages must be functions, optionally followed by one options object such as { concurrency: 2 }.",
      );
    }
    const items = [...itemInput];
    return deps.callPrimitive<unknown[]>({
      kind: "pipeline",
      refId: "pipeline",
      args: {
        itemCount: items.length,
        stageCount: stages.length,
        ...(concurrency === undefined ? {} : { concurrency }),
      },
      exec: () =>
        deps.runBlackBoxed(() =>
          runCompositionPool(items.length, concurrency, deps.abortSignal, async (index) => {
            const item = items[index];
            let stageIndex = 0;
            try {
              let prev: unknown = item;
              for (const stage of stages as PipelineStage[]) {
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
      decodeRecorded: (recorded) => recorded as unknown[],
    });
  };

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
