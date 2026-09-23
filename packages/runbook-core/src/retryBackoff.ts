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
 * - **replay rule** — resume the current attempt or delay; never rerun a settled attempt. On
 *   replay the sequence jumps straight to its latest settlement (`skipRecorded`), so settled
 *   attempts are not re-driven at all: their effects are not re-fired, and an attempt whose own
 *   primitive threw (which leaves no journal line of its own) cannot drift on replay. The delay
 *   is the existing durable `waitUntil`, so a crash mid-backoff resumes the SAME wake.
 * - **retention** — each settlement carries only the LAST classified failure; the final one is
 *   the bounded outcome, and a settled sequence replays as two entries, however many attempts it
 *   took.
 *
 * An attempt runs INLINE in the run's journal sequence — the way `workflow()` runs a
 * sub-workflow, not black-boxed the way `parallel()` is — so `fn` may call `agent()`,
 * `workflow()`, tools or `waitUntil` and each stays individually durable: an unfinished attempt
 * resumes part-way. Inside a black box (`parallel()`/`pipeline()`) nothing takes a seq, so there
 * is nothing to skip and `retry` degrades to a plain in-memory loop.
 */

import {
  JournalSchemaError,
  JournalSerializeError,
  ReplayDriftError,
  RetryExhaustedError,
  WorkflowAborted,
  WorkflowError,
  type RetryClassifiedFailure,
} from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { JournalEntry } from "./journalReader.ts";
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

/** The journaled settlement of one attempt. */
export type RetryAttemptRecord<T = unknown> =
  | (RetryAttemptBase & { readonly outcome: "ok"; readonly value?: T })
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
  readonly currentSeq: () => number;
  /** The recorded journal the runtime replays against. */
  readonly recorded: ReadonlyMap<number, JournalEntry>;
  /** Advance the cursor over a recorded span (DurablePrimitiveRuntime.skipRecorded). */
  readonly skipRecorded: (throughSeq: number) => void;
  /** Host clock — read only inside a live settlement; the deadline it yields is journaled. */
  readonly hostNow: () => number;
  /** The durable delay (scheduling.ts). */
  readonly waitUntil: SchedulePrimitives["waitUntil"];
  readonly isAllowed?: () => boolean;
  readonly denied?: () => Error;
}

/**
 * Engine control and integrity signals are never an attempt's failure: a suspension must park the
 * run, an abort must settle it, and drift/journal faults mean the run itself is broken.
 */
function isControlSignal(error: unknown): boolean {
  return (
    error instanceof WorkflowSuspended ||
    error instanceof WorkflowAborted ||
    error instanceof ReplayDriftError ||
    error instanceof JournalSchemaError ||
    error instanceof JournalSerializeError
  );
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

/** True when a journaled result decodes as a structurally valid `RetryAttemptRecord`. */
export function isRetryAttemptRecord(result: unknown): result is RetryAttemptRecord {
  if (typeof result !== "object" || result === null) return false;
  const record = result as Record<string, unknown>;
  if (!Number.isInteger(record.sequence) || !Number.isInteger(record.attempt)) return false;
  if (!Number.isInteger(record.maxAttempts)) return false;
  if (record.outcome === "ok") return true;
  if (typeof record.failure !== "object" || record.failure === null) return false;
  if (record.outcome === "retry") return typeof record.deadline === "number";
  return record.outcome === "exhausted" || record.outcome === "fatal";
}

export function createRetryPrimitives(deps: RetryPrimitivesDeps): RetryPrimitives {
  /** The highest-seq settlement journaled for `sequence`, if the journal holds one. */
  const latestSettlement = (
    sequence: number,
  ): { readonly seq: number; readonly record: RetryAttemptRecord } | undefined => {
    let latest: { readonly seq: number; readonly record: RetryAttemptRecord } | undefined;
    for (const entry of deps.recorded.values()) {
      if (entry.seq <= sequence) continue;
      if (entry.kind !== RETRY_KIND || entry.refId !== RETRY_ATTEMPT_REF_ID) continue;
      if (!isRetryAttemptRecord(entry.result) || entry.result.sequence !== sequence) continue;
      if (latest === undefined || entry.seq > latest.seq) {
        latest = { seq: entry.seq, record: entry.result };
      }
    }
    return latest;
  };

  const retryImpl = async <T>(
    fn: (attempt: number) => Promise<T>,
    opts: RetryOptions,
  ): Promise<T> => {
    validateOptions(opts);
    const { maxAttempts } = opts;
    let live = false;
    await deps.callPrimitive({
      kind: RETRY_KIND,
      refId: RETRY_START_REF_ID,
      args: { maxAttempts },
      exec: async () => {
        live = true;
        return { maxAttempts };
      },
    });
    const sequence = deps.currentSeq();

    const settle = (attempt: number, observe: () => RetryAttemptRecord<T>) =>
      deps.callPrimitive<RetryAttemptRecord<T>>({
        kind: RETRY_KIND,
        refId: RETRY_ATTEMPT_REF_ID,
        args: { sequence, attempt, maxAttempts },
        exec: async () => observe(),
      });

    const settleFailure = (attempt: number, error: unknown) =>
      settle(attempt, () => {
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

    const exhausted = (record: RetryAttemptRecord<T>, cause?: unknown): RetryExhaustedError => {
      if (record.outcome === "ok" || record.outcome === "retry") {
        throw new WorkflowError(`retry: attempt ${record.attempt} did not end the sequence.`);
      }
      return new RetryExhaustedError({
        attempts: record.attempt,
        maxAttempts,
        lastFailure: record.failure,
        cause,
      });
    };

    let attempt = 1;
    if (!live) {
      // Replay: jump to the latest settlement instead of re-driving every settled attempt.
      const latest = latestSettlement(sequence);
      if (latest !== undefined) {
        deps.skipRecorded(latest.seq - 1);
        const record = await settle(latest.record.attempt, () => {
          throw new WorkflowError("retry: a recorded settlement was asked to re-execute.");
        });
        if (record.outcome === "ok") return record.value as T;
        if (record.outcome !== "retry") throw exhausted(record);
        await deps.waitUntil(record.deadline);
        attempt = record.attempt + 1;
      }
    }

    for (; ; attempt += 1) {
      let value: T;
      try {
        value = await fn(attempt);
      } catch (error) {
        if (isControlSignal(error)) throw error;
        const record = await settleFailure(attempt, error);
        if (record.outcome !== "retry") throw exhausted(record, error);
        await deps.waitUntil(record.deadline);
        continue;
      }
      await settle(attempt, () => ({
        sequence,
        attempt,
        maxAttempts,
        outcome: "ok",
        ...(value === undefined ? {} : { value }),
      }));
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
