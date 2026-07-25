import { assert, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import {
  ATLASSIAN_REQUEST_TIMEOUT_MS,
  T3TeamAtlassianError,
  tryAtlassianPromise,
} from "./t3team-atlassian-http.ts";

it.effect("times out hanging Atlassian requests with a clear error message", () =>
  Effect.gen(function* () {
    const errorFiber = yield* tryAtlassianPromise(
      () => new Promise<never>(() => {}),
      "Failed to load Atlassian backlog.",
    ).pipe(Effect.flip, Effect.forkScoped);

    yield* Effect.yieldNow;
    yield* TestClock.adjust(Duration.millis(ATLASSIAN_REQUEST_TIMEOUT_MS));

    const error = yield* Fiber.join(errorFiber);
    assert.isTrue(error instanceof T3TeamAtlassianError);
    assert.equal(
      error.message,
      `Failed to load Atlassian backlog. Atlassian request timed out after ${ATLASSIAN_REQUEST_TIMEOUT_MS}ms. Check Jira auth and network connectivity.`,
    );
  }).pipe(Effect.provide(TestClock.layer())),
);

it.effect("preserves the upstream Atlassian error message when the request fails promptly", () =>
  Effect.gen(function* () {
    const error = yield* tryAtlassianPromise(
      () => Promise.reject(new Error("Atlassian rejected the request.")),
      "Failed to load Atlassian backlog.",
    ).pipe(Effect.flip);

    assert.isTrue(error instanceof T3TeamAtlassianError);
    assert.equal(error.message, "Atlassian rejected the request.");
  }),
);
