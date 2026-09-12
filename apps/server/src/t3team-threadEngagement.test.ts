/**
 * Per-thread typing engagement: a fresh composing heartbeat marks the thread
 * engaged; the signal is keyed PER THREAD (typing in A must not engage B) and
 * self-clears after the typing-lapse window — which is what makes the
 * reactor's no-cap back-off safe.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { T3TeamThreadEngagement, T3TeamThreadEngagementLive } from "./t3team-threadEngagement.ts";
import { T3TEAM_THREAD_TYPING_LAPSE_MS } from "./t3team-actorMessageReactorLimits.ts";

describe("T3TeamThreadEngagementLive", () => {
  const run = (body: (e: typeof T3TeamThreadEngagement.Service) => Effect.Effect<unknown>) =>
    Effect.gen(function* () {
      const engagement = yield* T3TeamThreadEngagement;
      yield* body(engagement);
    }).pipe(Effect.provide(T3TeamThreadEngagementLive));

  it.effect("is not engaged by default", () =>
    run((engagement) => Effect.gen(function* () {
      expect(yield* engagement.isEngaged("target")).toBe(false);
    })),
  );

  it.effect("a composing heartbeat engages the thread until it lapses", () =>
    run((engagement) =>
      Effect.gen(function* () {
        yield* engagement.noteTyping("target");
        expect(yield* engagement.isEngaged("target")).toBe(true);
        // Just inside the lapse window: the user is still in their sentence.
        yield* TestClock.adjust(`${T3TEAM_THREAD_TYPING_LAPSE_MS - 1} millis`);
        expect(yield* engagement.isEngaged("target")).toBe(true);
        // Past it: they stopped typing, the drain may claim.
        yield* TestClock.adjust("2 millis");
        expect(yield* engagement.isEngaged("target")).toBe(false);
      }),
    ),
  );

  it.effect("a newer heartbeat re-engages after the lapse window elapsed", () =>
    run((engagement) =>
      Effect.gen(function* () {
        yield* engagement.noteTyping("target");
        yield* TestClock.adjust(`${T3TEAM_THREAD_TYPING_LAPSE_MS + 100} millis`);
        expect(yield* engagement.isEngaged("target")).toBe(false);
        yield* engagement.noteTyping("target");
        expect(yield* engagement.isEngaged("target")).toBe(true);
      }),
    ),
  );

  it.effect("typing in one thread does NOT engage another (per-thread scoping)", () =>
    run((engagement) =>
      Effect.gen(function* () {
        // A user working in thread A while background orchestrators run in B
        // and C must not starve B or C.
        yield* engagement.noteTyping("thread-a");
        expect(yield* engagement.isEngaged("thread-a")).toBe(true);
        expect(yield* engagement.isEngaged("thread-b")).toBe(false);
        expect(yield* engagement.isEngaged("thread-c")).toBe(false);
        // And typing in B engages only B.
        yield* engagement.noteTyping("thread-b");
        expect(yield* engagement.isEngaged("thread-b")).toBe(true);
        expect(yield* engagement.isEngaged("thread-c")).toBe(false);
      }),
    ),
  );

  it.effect("lapse is per thread: A lapsing does not touch B's fresh heartbeat", () =>
    run((engagement) =>
      Effect.gen(function* () {
        yield* engagement.noteTyping("thread-a");
        yield* TestClock.adjust("500 millis");
        yield* engagement.noteTyping("thread-b");
        // A's heartbeat is now older than the lapse; B's is fresh.
        yield* TestClock.adjust(`${T3TEAM_THREAD_TYPING_LAPSE_MS} millis`);
        expect(yield* engagement.isEngaged("thread-a")).toBe(false);
        expect(yield* engagement.isEngaged("thread-b")).toBe(true);
      }),
    ),
  );
});
