import { describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "./durableRuntime.ts";
import { ReplayDriftError, RetryExhaustedError, WorkflowError } from "./errors.ts";
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
      runBlackBoxed: runtime.runBlackBoxed,
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

    // Resume before the wake: the live clock must not be read, the settled attempt's throwing tool
    // must not re-fire (its replay is a gap the journaled settlement resolves), and the SAME wake
    // (same correlation, unchanged deadline) is awaited — not re-fired.
    const beforeWake = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(beforeWake)).rejects.toBeInstanceOf(WorkflowSuspended);
    expect(toolFires).toBe(1);
    expect(beforeWake.wakes).toEqual([]);

    // The host delivers the wake; the next resume runs attempt 2 — and only attempt 2 — live.
    harness.deliverWake("run-retry:4");
    const resumed = harness.boot({ clock: () => T0 + 5_000, wake: "defer" });
    await expect(body(resumed)).resolves.toBe("ok-2");
    // Attempt 1 is re-driven in replay (fn sees attempt 1 again) but fires nothing live.
    expect(calls).toEqual([1, 1, 1, 2]);
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
      { sequence: 1, attempt: 2, maxAttempts: 3, outcome: "ok" },
    ]);
  });

  it("throws a typed RetryExhaustedError with the last classified failure after maxAttempts", async () => {
    const harness = makeHarness();
    // The host clock advances 10 s per attempt, so each deadline must come from the clock AT that
    // attempt's failure, not from the sequence start.
    let clock = T0;
    const run = harness.boot({ clock: () => clock, wake: "now" });
    const seen: number[] = [];
    const error = await run
      .retry(
        async (attempt) => {
          seen.push(attempt);
          clock = T0 + attempt * 10_000;
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
    expect(run.wakes.map((wake) => wake.deadline)).toEqual([T0 + 11_000, T0 + 22_000]);

    // Replay after exhaustion raises the same typed error from the journal: no live clock read,
    // no wake re-requested, and the classifier is not consulted again.
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    const replayed = await replay
      .retry(
        async (attempt) => {
          throw new TypeError(`bad ${attempt}`);
        },
        {
          maxAttempts: 3,
          backoff,
          classify: () => {
            throw new Error("replay consulted the classifier");
          },
        },
      )
      .catch((thrown: unknown) => thrown);
    expect(replayed).toBeInstanceOf(RetryExhaustedError);
    expect((replayed as RetryExhaustedError).lastFailure).toEqual(exhausted.lastFailure);
    expect(replay.wakes).toEqual([]);
  });

  it("keeps only the bound and the last failure, and replays a settled sequence without firing", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const opts: RetryOptions = { maxAttempts: 5, backoff };
    let fires = 0;
    const fn = (runtime: Run["runtime"]) => async (attempt: number) => {
      await runtime.callPrimitive({
        kind: "tool",
        refId: "call",
        args: { attempt },
        exec: async () => {
          fires += 1;
          return attempt;
        },
      });
      if (attempt < 4) throw new Error(`fail ${attempt}`);
      return { attempt };
    };
    await expect(run.retry(fn(run.runtime), opts)).resolves.toEqual({ attempt: 4 });
    expect(fires).toBe(4);

    // Every settlement is bounded: the configured bound plus at most the LAST failure — no
    // accumulated attempt history, and no journaled copy of the success value.
    const settlements = harness.entries().filter((entry) => entry.refId === RETRY_ATTEMPT_REF_ID);
    expect(settlements.map((entry) => entry.result)).toEqual([
      expect.objectContaining({
        attempt: 1,
        outcome: "retry",
        failure: expect.objectContaining({ message: "fail 1" }),
      }),
      expect.objectContaining({
        attempt: 2,
        outcome: "retry",
        failure: expect.objectContaining({ message: "fail 2" }),
      }),
      expect.objectContaining({
        attempt: 3,
        outcome: "retry",
        failure: expect.objectContaining({ message: "fail 3" }),
      }),
      { sequence: 1, attempt: 4, maxAttempts: 5, outcome: "ok" },
    ]);
    const start = harness.entries().find((entry) => entry.refId === "retry.start");
    expect(start?.result).toEqual({ maxAttempts: 5 });

    // Replay after settlement: the same value, zero live effects, zero live-clock reads, zero wakes.
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(replay.retry(fn(replay.runtime), opts)).resolves.toEqual({ attempt: 4 });
    expect(fires).toBe(4);
    expect(replay.wakes).toEqual([]);
  });

  it("keeps a jittered backoff replay-deterministic", async () => {
    const harness = makeHarness();
    const jitter = (run: Run) => (attempt: number) => 1_000 * attempt + run.runtime.random() * 10;
    const body = (run: Run) =>
      run.retry(
        async (attempt) => {
          if (attempt === 1) throw new Error("flaky");
          return attempt;
        },
        { maxAttempts: 2, backoff: jitter(run) },
      );
    const first = harness.boot({ clock: () => T0, wake: "now" });
    await expect(body(first)).resolves.toBe(2);
    // The jitter draw is black-boxed inside the settlement: no seq of its own.
    expect(harness.entries().map((entry) => entry.kind)).not.toContain("random");

    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(replay)).resolves.toBe(2);
  });

  it("rebuilds closure state a settled attempt wrote, on replay", async () => {
    const harness = makeHarness();
    const body = async (run: Run) => {
      const seen: string[] = [];
      await run.retry(
        async (attempt) => {
          const reply = await run.runtime.callPrimitive({
            kind: "tool",
            refId: "fetch",
            args: { attempt },
            exec: async () => `reply-${attempt}`,
          });
          seen.push(reply);
          if (attempt === 1) throw new Error("rejected");
        },
        { maxAttempts: 2, backoff: () => 0 },
      );
      return seen;
    };
    const first = harness.boot({ clock: () => T0, wake: "now" });
    await expect(body(first)).resolves.toEqual(["reply-1", "reply-2"]);
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(replay)).resolves.toEqual(["reply-1", "reply-2"]);
  });

  it("resolves a gap inside a nested retry and resumes at every wake without re-firing", async () => {
    const harness = makeHarness();
    const fires: string[] = [];
    // Outer attempt o runs an inner retry whose first attempt's tool THROWS (a gap), then the
    // outer attempt itself fails once. Every wake defers, so each resume is a crash point.
    const body = (run: Run) =>
      run.retry(
        async (outer) => {
          await run.retry(
            async (inner) =>
              run.runtime.callPrimitive({
                kind: "tool",
                refId: "inner",
                args: { outer, inner },
                exec: async () => {
                  fires.push(`o${outer}i${inner}`);
                  if (inner === 1) throw new Error("inner 503");
                  return inner;
                },
              }),
            { maxAttempts: 2, backoff: () => 1_000 },
          );
          if (outer === 1) throw new Error("outer rejected");
          return outer;
        },
        { maxAttempts: 2, backoff: () => 5_000 },
      );

    let outcome: unknown;
    for (let resumes = 0; resumes < 10; resumes += 1) {
      const run = harness.boot({ clock: () => T0, wake: "defer" });
      outcome = await body(run).catch((error: unknown) => error);
      if (!(outcome instanceof WorkflowSuspended)) break;
      harness.deliverWake(outcome.correlationId);
    }
    expect(outcome).toBe(2);
    expect(fires).toEqual(["o1i1", "o1i2", "o2i1", "o2i2"]);

    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(replay)).resolves.toBe(2);
    expect(fires).toHaveLength(4);
  });

  it("keeps real drift inside a settled attempt loud", async () => {
    const harness = makeHarness();
    const body = (run: Run, refId: string) =>
      run.retry(
        async (attempt) => {
          await run.runtime.callPrimitive({
            kind: "tool",
            refId,
            args: { attempt },
            exec: async () => attempt,
          });
          if (attempt === 1) throw new Error("rejected");
          return attempt;
        },
        { maxAttempts: 2, backoff: () => 0 },
      );
    await expect(body(harness.boot({ clock: () => T0, wake: "now" }), "v1")).resolves.toBe(2);
    // The body was edited: the settled attempt's call changed identity. Not a gap — must throw.
    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    await expect(body(replay, "v2")).rejects.toBeInstanceOf(ReplayDriftError);
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

  it("stops at a fatal classification on a later attempt, and replays it from the journal", async () => {
    const harness = makeHarness();
    const body = (run: Run) =>
      run.retry(
        async (attempt) => {
          throw attempt === 1 ? new Error("transient") : new RangeError("permanent");
        },
        {
          maxAttempts: 5,
          backoff,
          classify: (thrown) => (thrown instanceof RangeError ? "fatal" : "retryable"),
        },
      );
    const first = harness.boot({ clock: () => T0, wake: "now" });
    const error = await body(first).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect((error as RetryExhaustedError).attempts).toBe(2);
    expect((error as RetryExhaustedError).lastFailure.classification).toBe("fatal");
    expect(first.wakes).toHaveLength(1);

    const replay = harness.boot({ clock: LIVE_CLOCK_FORBIDDEN, wake: "defer" });
    const replayed = await body(replay).catch((thrown: unknown) => thrown);
    expect((replayed as RetryExhaustedError).attempts).toBe(2);
    expect(replay.wakes).toEqual([]);
  });

  it("exhausts immediately at maxAttempts 1 without a wake", async () => {
    const harness = makeHarness();
    const run = harness.boot({ clock: () => T0, wake: "now" });
    const error = await run
      .retry(
        async () => {
          throw new Error("once");
        },
        { maxAttempts: 1, backoff },
      )
      .catch((thrown: unknown) => thrown);
    expect((error as RetryExhaustedError).attempts).toBe(1);
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
      runBlackBoxed: (fn) => fn(),
      hostNow: () => T0,
      waitUntil: async () => {},
      isAllowed: () => false,
      denied: () => denied,
    });
    expect(() => retry(async () => 1, { maxAttempts: 1, backoff })).toThrow(denied);
  });
});
