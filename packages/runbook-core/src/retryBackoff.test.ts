import { describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "./durableRuntime.ts";
import { RetryExhaustedError, WorkflowError } from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import { buildJournalMaps } from "./journalReader.ts";
import type { JournalEntry } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";
import { toResolvedWire, toWire, type ResolvedWireInput } from "./journalWriter.ts";
import { PRIMITIVE_KINDS } from "./primitiveKinds.ts";
import {
  createRetryPrimitives,
  RETRY_ATTEMPT_REF_ID,
  RETRY_KIND,
  type RetryOptions,
} from "./retryBackoff.ts";
import { createSchedulePrimitives, type ScheduleRequest } from "./scheduling.ts";

const T0 = 1_700_000_000_000;
const ISO = "2026-09-23T00:00:00.000Z";

/** A crash-and-resume harness: every run appends to one durable wire log. */
const makeHarness = () => {
  const wires: Record<string, unknown>[] = [];
  const sink: JournalSink = {
    append: (entry: JournalEntry) => wires.push(toWire(entry)),
    appendResolved: (entry: ResolvedWireInput) => wires.push(toResolvedWire(entry)),
    flush: async () => {},
    dispose: () => {},
  };

  const boot = (opts: {
    readonly clock: () => number;
    /** How the host answers a wake request: `"now"` settles it immediately, `"defer"` parks. */
    readonly wake: "now" | "defer";
  }) => {
    const maps = buildJournalMaps(wires);
    const runtime = createDurableRuntime({
      journal: maps.bySeq,
      resolved: maps.byCorrelation,
      writer: sink,
      runId: "run-retry",
      source: { now: opts.clock, random: () => 0.5, uuid: () => "uuid" },
      nowIso: () => ISO,
    });
    const wakes: ScheduleRequest[] = [];
    const { waitUntil } = createSchedulePrimitives({
      dispatch: runtime.handles,
      delivery: {
        schedule: async (request, resolver) => {
          wakes.push(request);
          if (opts.wake === "now") resolver.resolve(undefined);
        },
      },
    });
    const { retry } = createRetryPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      recorded: runtime.recorded,
      skipRecorded: runtime.skipRecorded,
      hostNow: runtime.hostNow,
      waitUntil,
    });
    return { runtime, retry, wakes };
  };

  /** The host delivering the wake reply out of band, exactly like `appendResolvedEntry`. */
  const deliverWake = (correlationId: string): void => {
    wires.push(
      toResolvedWire({
        correlationId,
        kind: "wait.until",
        refId: "wait.until",
        reply: undefined,
        startedAt: ISO,
        endedAt: ISO,
      }),
    );
  };

  const entries = () => [...buildJournalMaps(wires).bySeq.values()].sort((a, b) => a.seq - b.seq);
  return { boot, deliverWake, entries };
};

type Run = ReturnType<ReturnType<typeof makeHarness>["boot"]>;

const LIVE_CLOCK_FORBIDDEN = () => {
  throw new Error("replay evaluated the live clock");
};

const backoff = (attempt: number) => attempt * 1_000;

describe("@runbook/core retry primitive", () => {
  it("is a built-in primitive kind", () => {
    expect(PRIMITIVE_KINDS).toContain("retry");
  });

  it("resumes a crash mid-backoff at the same attempt with the journaled deadline", async () => {
    const harness = makeHarness();
    const calls: number[] = [];
    let toolFires = 0;

    // Attempt 1 calls a journaled tool that THROWS — a failure that leaves no journal line of its
    // own — then the retry parks on the backoff wake. The process "crashes" there.
    const first = harness.boot({ clock: () => T0, wake: "defer" });
    const body = (run: Run) =>
      run.retry(
        async (attempt) => {
          calls.push(attempt);
          return run.runtime.callPrimitive({
            kind: "tool",
            refId: "flaky",
            args: { attempt },
            exec: async () => {
              toolFires += 1;
              if (attempt === 1) throw new Error("upstream 503");
              return `ok-${attempt}`;
            },
          });
        },
        { maxAttempts: 3, backoff },
      );
    const crashed = await body(first).catch((error: unknown) => error);
    expect(crashed).toBeInstanceOf(WorkflowSuspended);
    expect(first.wakes).toEqual([{ correlationId: "run-retry:4", deadline: T0 + 1_000 }]);
    expect(calls).toEqual([1]);

    // Resume before the wake: the live clock must not be read, the settled attempt must not be
    // re-driven, and the SAME wake (same correlation, unchanged deadline) is awaited — not re-fired.
    const beforeWake = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(beforeWake)).rejects.toBeInstanceOf(WorkflowSuspended);
    expect(calls).toEqual([1]);
    expect(beforeWake.wakes).toEqual([]);

    // The host delivers the wake; the next resume runs attempt 2 — and only attempt 2 — live.
    harness.deliverWake("run-retry:4");
    const resumed = harness.boot({ clock: () => T0 + 5_000, wake: "defer" });
    await expect(body(resumed)).resolves.toBe("ok-2");
    expect(calls).toEqual([1, 2]);
    expect(toolFires).toBe(2);
    expect(resumed.wakes).toEqual([]);

    const settlements = harness
      .entries()
      .filter((entry) => entry.refId === RETRY_ATTEMPT_REF_ID)
      .map((entry) => entry.result);
    expect(settlements).toEqual([
      {
        sequence: 1,
        attempt: 1,
        maxAttempts: 3,
        outcome: "retry",
        failure: { classification: "retryable", name: "Error", message: "upstream 503" },
        deadline: T0 + 1_000,
      },
      { sequence: 1, attempt: 2, maxAttempts: 3, outcome: "ok", value: "ok-2" },
    ]);
  });

  it("throws a typed RetryExhaustedError with the last classified failure after maxAttempts", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const seen: number[] = [];
    const error = await run
      .retry(
        async (attempt) => {
          seen.push(attempt);
          throw new TypeError(`bad ${attempt}`);
        },
        { maxAttempts: 3, backoff },
      )
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect(error).toBeInstanceOf(WorkflowError);
    const exhausted = error as RetryExhaustedError;
    expect(exhausted.attempts).toBe(3);
    expect(exhausted.maxAttempts).toBe(3);
    expect(exhausted.lastFailure).toEqual({
      classification: "retryable",
      name: "TypeError",
      message: "bad 3",
    });
    expect((exhausted as { cause?: unknown }).cause).toBeInstanceOf(TypeError);
    expect(seen).toEqual([1, 2, 3]);
    // Two backoffs between three attempts, each deadline from its own attempt's backoff.
    expect(run.wakes.map((wake) => wake.deadline)).toEqual([T0 + 1_000, T0 + 2_000]);

    // Replay after exhaustion raises the same typed error without re-running any attempt.
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    const replayed = await replay
      .retry(
        async (attempt) => {
          seen.push(attempt);
          throw new TypeError("must not run");
        },
        { maxAttempts: 3, backoff },
      )
      .catch((thrown: unknown) => thrown);
    expect(replayed).toBeInstanceOf(RetryExhaustedError);
    expect((replayed as RetryExhaustedError).lastFailure).toEqual(exhausted.lastFailure);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("replays a settled sequence as its bounded final outcome, not every attempt", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const opts: RetryOptions = { maxAttempts: 5, backoff };
    const fn = async (attempt: number) => {
      if (attempt < 4) throw new Error(`fail ${attempt}`);
      return { attempt };
    };
    await expect(run.retry(fn, opts)).resolves.toEqual({ attempt: 4 });
    const recordedSeqs = harness.entries().map((entry) => entry.seq);

    // The final settlement carries the bound and the LAST failure only — no per-attempt history.
    const settlements = harness.entries().filter((entry) => entry.refId === RETRY_ATTEMPT_REF_ID);
    expect(settlements.at(-1)?.result).toEqual({
      sequence: 1,
      attempt: 4,
      maxAttempts: 5,
      outcome: "ok",
      value: { attempt: 4 },
    });
    expect(settlements.at(-2)?.result).toMatchObject({
      attempt: 3,
      failure: { message: "fail 3" },
    });

    // Replay touches exactly two retry entries — the bound and the final outcome — and none of
    // the intermediate attempts or backoff wakes.
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    const replayedCalls: string[] = [];
    const observed = createRetryPrimitives({
      callPrimitive: (call) => {
        replayedCalls.push(call.refId);
        return replay.runtime.callPrimitive(call);
      },
      currentSeq: replay.runtime.currentSeq,
      recorded: replay.runtime.recorded,
      skipRecorded: replay.runtime.skipRecorded,
      hostNow: replay.runtime.hostNow,
      waitUntil: () => {
        throw new Error("a settled sequence must not re-await a backoff");
      },
    });
    const replayFn = async (attempt: number): Promise<{ attempt: number }> => {
      throw new Error(`attempt ${attempt} re-ran`);
    };
    await expect(observed.retry(replayFn, opts)).resolves.toEqual({ attempt: 4 });
    expect(replayedCalls).toEqual(["retry.start", "retry.attempt"]);
    expect(replay.runtime.currentSeq()).toBe(Math.max(...recordedSeqs));
  });

  it("short-circuits on a fatal classification without backing off", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const seen: number[] = [];
    const error = await run
      .retry(
        async (attempt) => {
          seen.push(attempt);
          throw new RangeError("invalid input");
        },
        {
          maxAttempts: 5,
          backoff,
          classify: (thrown) => (thrown instanceof RangeError ? "fatal" : "retryable"),
        },
      )
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect((error as RetryExhaustedError).attempts).toBe(1);
    expect((error as RetryExhaustedError).lastFailure).toEqual({
      classification: "fatal",
      name: "RangeError",
      message: "invalid input",
    });
    expect(seen).toEqual([1]);
    expect(run.wakes).toEqual([]);
  });

  it("never classifies an engine control signal as an attempt failure", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "defer" });
    let classified = 0;
    const error = await run
      .retry(
        async () => {
          throw new WorkflowSuspended("run-retry:99");
        },
        {
          maxAttempts: 3,
          backoff,
          classify: () => {
            classified += 1;
            return "retryable";
          },
        },
      )
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(WorkflowSuspended);
    expect(classified).toBe(0);
    expect(harness.entries().filter((entry) => entry.kind === RETRY_KIND)).toHaveLength(1);
  });

  it("composes with inline durable primitives: an attempt resumes part-way without re-firing", async () => {
    const harness = makeHarness();
    const fires: string[] = [];
    // Each attempt performs two journaled effects; attempt 1 fails AFTER both of them.
    const body = (run: Run) =>
      run.retry(
        async (attempt) => {
          for (const step of ["plan", "apply"]) {
            await run.runtime.callPrimitive({
              kind: "tool",
              refId: step,
              args: { attempt },
              exec: async () => {
                fires.push(`${step}-${attempt}`);
                return step;
              },
            });
          }
          if (attempt === 1) throw new Error("verification failed");
          return attempt;
        },
        { maxAttempts: 2, backoff: () => 0 },
      );

    const first = harness.boot({ clock: () => T0, wake: "now" });
    await expect(body(first)).resolves.toBe(2);
    expect(fires).toEqual(["plan-1", "apply-1", "plan-2", "apply-2"]);

    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(replay)).resolves.toBe(2);
    expect(fires).toHaveLength(4);
  });

  it("rejects invalid options before journaling anything", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const fn = async () => "never";
    await expect(run.retry(fn, { maxAttempts: 0, backoff })).rejects.toBeInstanceOf(WorkflowError);
    await expect(run.retry(fn, { maxAttempts: 1.5, backoff })).rejects.toBeInstanceOf(
      WorkflowError,
    );
    expect(harness.entries()).toHaveLength(0);

    const negative = await run
      .retry(
        async () => {
          throw new Error("x");
        },
        { maxAttempts: 2, backoff: () => -1 },
      )
      .catch((thrown: unknown) => thrown);
    expect(negative).toBeInstanceOf(WorkflowError);
    expect((negative as Error).message).toMatch(/non-negative delay/);
  });

  it("keeps the host's denied-capability error", () => {
    const denied = new Error("schedule denied by host");
    const { retry } = createRetryPrimitives({
      callPrimitive: async () => {
        throw new Error("must not journal");
      },
      currentSeq: () => 0,
      recorded: new Map(),
      skipRecorded: () => {},
      hostNow: () => T0,
      waitUntil: async () => {},
      isAllowed: () => false,
      denied: () => denied,
    });
    expect(() => retry(async () => 1, { maxAttempts: 1, backoff })).toThrow(denied);
  });
});

describe("@runbook/core durable runtime skipRecorded", () => {
  it("only moves forward over recorded ground", async () => {
    const runtime = createDurableRuntime({
      journal: new Map([
        [
          1,
          {
            seq: 1,
            callId: "1:tool:a",
            kind: "tool",
            refId: "a",
            argsHash: "x",
            result: 1,
            startedAt: ISO,
            endedAt: ISO,
          },
        ],
      ]),
      writer: {
        append: () => {},
        appendResolved: () => {},
        flush: async () => {},
        dispose: () => {},
      },
      source: { now: () => T0, random: () => 0.5, uuid: () => "u" },
    });
    expect(() => runtime.skipRecorded(2)).toThrow(WorkflowError);
    runtime.skipRecorded(1);
    expect(runtime.currentSeq()).toBe(1);
    expect(() => runtime.skipRecorded(0)).toThrow(WorkflowError);
    await runtime.runBlackBoxed(async () => {
      expect(() => runtime.skipRecorded(1)).toThrow(/black-boxed/);
    });
  });
});
