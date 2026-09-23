/**
 * Bounded execution — the `retry` / `backoff` primitive.
 *
 * `retry(fn, { maxAttempts, backoff, classify })` replaces a hand-written retry loop whose attempts
 * silently expand the journal and whose failed attempts cannot be replayed. Exhaustion is an
 * ordinary typed workflow failure ({@link RetryExhaustedError}).
 *
 * The three-part contract (docs/runbook/bounded-execution.md):
 *
 * - **journal shape** — one `retry.start` entry (the configured attempt bound) per sequence, then
 *   one `retry.attempt` settlement per attempt: its attempt number, its outcome, the last
 *   classified failure, and — for a retryable failure — the backoff DEADLINE. The deadline is
 *   computed from the host clock inside the live settlement only, so a replayed body reads the
 *   journaled value and never the live clock.
 * - **replay rule** — resume the current attempt or delay; never rerun a settled attempt's
 *   effects. Attempts run INLINE in the run's journal sequence, the way `workflow()` runs a
 *   sub-workflow, so a replay re-drives each attempt against the journal: its effects replay from
 *   their recorded entries (nothing re-fires), closures the attempt writes are rebuilt, and an
 *   unfinished attempt resumes part-way. The one thing a re-drive cannot replay is a primitive
 *   that THREW — it consumed a seq but journaled nothing, so its replay raises a gap drift. Inside
 *   a settled attempt that gap is expected: the attempt's journaled settlement is the authority,
 *   and replaying it realigns the sequence. Outside one (no settlement recorded) the gap is real
 *   drift and is re-raised. The delay is the existing durable `waitUntil`, so a crash mid-backoff
 *   resumes the SAME wake.
 * - **retention** — each settlement carries only the bound and the LAST classified failure, never
 *   an attempt history; the final settlement is the bounded outcome. Physically pruning a settled
 *   sequence's attempt detail is a journal-backend capability, as it is for `checkpoint`.
 *
 * `fn` may call `agent()`, `workflow()`, tools or `waitUntil`; each stays individually durable.
 * Inside `parallel()`/`pipeline()` (black boxes: nothing is journaled) the backoff `waitUntil`
 * cannot durably park, so `retry` there has the same limits as `waitUntil` there.
 */

import {
  JournalSchemaError,
  JournalSerializeError,
  PermissionDeniedError,
  ReplayDriftError,
  RetryExhaustedError,
  SubWorkflowCheckpointError,
  WorkflowAborted,
  WorkflowError,
  WorkflowInputDecodeError,
  WorkflowLoadError,
  type RetryClassifiedFailure,
} from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { SchedulePrimitives } from "./scheduling.ts";

/** The journal kind every retry entry occupies on the existing `PrimitiveCall` surface. */
export const RETRY_KIND = "retry";
/** Opens a sequence; its args are the configured attempt bound. */
export const RETRY_START_REF_ID = "retry.start";
/** Settles one attempt; its args bind it to its sequence and attempt number. */
export const RETRY_ATTEMPT_REF_ID = "retry.attempt";

export type RetryClassification = RetryClassifiedFailure["classification"];

export interface RetryOptions {
  /** Total attempts, including the first. A positive integer. */
  readonly maxAttempts: number;
  /** Delay in ms before the next attempt, given the 1-based attempt that just failed. */
  readonly backoff: (attempt: number) => number;
  /** Defaults to `"retryable"` for every failure. `"fatal"` gives up immediately. */
  readonly classify?: (error: unknown) => RetryClassification;
}

interface RetryAttemptBase {
  /** Seq of the sequence's `retry.start` entry — what ties a settlement to its sequence. */
  readonly sequence: number;
  readonly attempt: number;
  readonly maxAttempts: number;
}

/**
 * The journaled settlement of one attempt. A success records no value: a replay re-drives the
 * attempt, so its value (and anything it wrote to closures) comes back from the attempt itself.
 */
export type RetryAttemptRecord =
  | (RetryAttemptBase & { readonly outcome: "ok" })
  | (RetryAttemptBase & {
      readonly outcome: "retry";
      readonly failure: RetryClassifiedFailure;
      /** Journaled wake instant for the next attempt (epoch ms). */
      readonly deadline: number;
    })
  | (RetryAttemptBase & {
      readonly outcome: "exhausted" | "fatal";
      readonly failure: RetryClassifiedFailure;
    });

export interface RetryPrimitives {
  readonly retry: <T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions) => Promise<T>;
}

export interface RetryPrimitivesDeps {
  /** The durable runtime's journaling primitive, narrowed to the retry kind (see checkpoint.ts). */
  readonly callPrimitive: <R>(call: {
    readonly kind: typeof RETRY_KIND;
    readonly refId: string;
    readonly args: unknown;
    readonly exec: () => Promise<R>;
  }) => Promise<R>;
  /** Existing DurablePrimitiveRuntime cursor; read right after the start entry is journaled. */
  readonly currentSeq: () => number;
  /**
   * Existing DurablePrimitiveRuntime black box. `classify` and `backoff` run inside it, so jitter
   * (`Math.random`) or a clock read in them takes no seq of its own — the settlement they produce
   * is the one journaled result, and a replay that skips them stays aligned.
   */
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  /** Host clock — read only inside a live settlement; the deadline it yields is journaled. */
  readonly hostNow: () => number;
  /** The durable delay (scheduling.ts). */
  readonly waitUntil: SchedulePrimitives["waitUntil"];
  readonly isAllowed?: () => boolean;
  readonly denied?: () => Error;
}

/**
 * Failures that are never an attempt's to classify: engine control signals (a suspension must park
 * the run, an abort must settle it), journal integrity faults, and deterministic refusals that no
 * amount of waiting fixes. They propagate unchanged.
 */
function propagatesUnclassified(error: unknown): boolean {
  return (
    error instanceof WorkflowSuspended ||
    error instanceof WorkflowAborted ||
    error instanceof JournalSchemaError ||
    error instanceof JournalSerializeError ||
    error instanceof PermissionDeniedError ||
    error instanceof SubWorkflowCheckpointError ||
    error instanceof WorkflowInputDecodeError ||
    error instanceof WorkflowLoadError ||
    (error instanceof ReplayDriftError && !isGapDrift(error))
  );
}

/**
 * The drift a re-driven attempt raises at a primitive that threw on the original run (a consumed
 * seq with no journal line). Only this shape is resolved by the attempt's settlement; a changed
 * call identity or changed args inside an attempt is real drift and stays loud.
 */
function isGapDrift(error: unknown): error is ReplayDriftError {
  return error instanceof ReplayDriftError && error.expected.presence === "gap";
}

function describeFailure(
  error: unknown,
  classification: RetryClassification,
): RetryClassifiedFailure {
  if (error instanceof Error) return { classification, name: error.name, message: error.message };
  return { classification, name: typeof error, message: String(error) };
}

function validateOptions(opts: RetryOptions): void {
  if (!Number.isInteger(opts.maxAttempts) || opts.maxAttempts < 1) {
    throw new WorkflowError(
      `retry: maxAttempts must be a positive integer (got ${String(opts.maxAttempts)}).`,
    );
  }
  if (typeof opts.backoff !== "function") {
    throw new WorkflowError("retry: backoff must be a function (attempt) => delayMs.");
  }
}

/** A re-driven attempt ended differently from its journaled settlement. */
function outcomeDrift(seq: number, recorded: string, observed: string): ReplayDriftError {
  return new ReplayDriftError({
    seq,
    reason: "call",
    expected: { kind: RETRY_KIND, outcome: recorded },
    observed: { kind: RETRY_KIND, outcome: observed },
  });
}

export function createRetryPrimitives(deps: RetryPrimitivesDeps): RetryPrimitives {
  const retryImpl = async <T>(
    fn: (attempt: number) => Promise<T>,
    opts: RetryOptions,
  ): Promise<T> => {
    validateOptions(opts);
    const { maxAttempts } = opts;
    await deps.callPrimitive({
      kind: RETRY_KIND,
      refId: RETRY_START_REF_ID,
      args: { maxAttempts },
      exec: async () => ({ maxAttempts }),
    });
    const sequence = deps.currentSeq();

    // `observe` runs only on the live path; a replay returns the journaled settlement instead.
    const settle = (attempt: number, observe: () => RetryAttemptRecord) =>
      deps.callPrimitive<RetryAttemptRecord>({
        kind: RETRY_KIND,
        refId: RETRY_ATTEMPT_REF_ID,
        args: { sequence, attempt, maxAttempts },
        exec: () => deps.runBlackBoxed(async () => observe()),
      });

    const settleFailure = (attempt: number, error: unknown) =>
      settle(attempt, (): RetryAttemptRecord => {
        // Reaching here live means no settlement was journaled: the gap is not a settled failure.
        if (isGapDrift(error)) throw error;
        const classification = opts.classify?.(error) ?? "retryable";
        const failure = describeFailure(error, classification);
        const base = { sequence, attempt, maxAttempts, failure };
        if (classification === "fatal") return { ...base, outcome: "fatal" };
        if (attempt >= maxAttempts) return { ...base, outcome: "exhausted" };
        const delay = opts.backoff(attempt);
        if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
          throw new WorkflowError(
            `retry: backoff(${attempt}) must return a finite, non-negative delay in ms (got ${String(delay)}).`,
          );
        }
        return { ...base, outcome: "retry", deadline: deps.hostNow() + delay };
      });

    for (let attempt = 1; ; attempt += 1) {
      let value: T;
      try {
        value = await fn(attempt);
      } catch (error) {
        if (propagatesUnclassified(error)) throw error;
        const record = await settleFailure(attempt, error);
        if (record.outcome === "ok") throw outcomeDrift(deps.currentSeq(), "ok", "failed");
        if (record.outcome === "retry") {
          await deps.waitUntil(record.deadline);
          continue;
        }
        throw new RetryExhaustedError({
          attempts: record.attempt,
          maxAttempts,
          lastFailure: record.failure,
          cause: isGapDrift(error) ? undefined : error,
        });
      }
      const record = await settle(attempt, () => ({
        sequence,
        attempt,
        maxAttempts,
        outcome: "ok",
      }));
      if (record.outcome !== "ok") throw outcomeDrift(deps.currentSeq(), record.outcome, "ok");
      return value;
    }
  };

  if (deps.isAllowed?.() === false) {
    return {
      retry: () => {
        throw (
          deps.denied?.() ??
          new WorkflowError("retry is unavailable because scheduling is not enabled.")
        );
      },
    };
  }
  return { retry: retryImpl };
}
