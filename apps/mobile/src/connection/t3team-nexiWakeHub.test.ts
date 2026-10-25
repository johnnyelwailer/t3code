import { it, expect } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { createNexiWakeups } from "./t3team-nexiWakeHub";

/** Runs the wakeups stream; `subscribed` completes only once the hub has registered its listeners. */
const harness = Effect.fn("nexiWakeHub.harness")(function* (take: number) {
  const subscribed = Deferred.makeUnsafe<void>();
  let notifyAccount = () => {};
  const hub = createNexiWakeups((listener) => {
    notifyAccount = listener;
    Deferred.doneUnsafe(subscribed, Effect.void);
    return () => {};
  });
  const reasons = yield* hub.changes.pipe(
    Stream.take(take),
    Stream.runCollect,
    Effect.forkChild({ startImmediately: true }),
  );
  yield* Deferred.await(subscribed);
  return { hub, reasons, accountChanged: () => notifyAccount() };
});

it.effect("wakes parked broker connections without the T3 Connect credential-change reason", () =>
  Effect.gen(function* () {
    const { hub, reasons } = yield* harness(1);
    hub.wakeBroker();
    expect(Array.from(yield* Fiber.join(reasons))).toEqual(["broker-availability-changed"]);
  }),
);

it.effect("keeps Nexplore account changes on the credentials-changed reason", () =>
  Effect.gen(function* () {
    const { reasons, accountChanged } = yield* harness(1);
    accountChanged();
    expect(Array.from(yield* Fiber.join(reasons))).toEqual(["credentials-changed"]);
  }),
);

it.effect("delivers each kind of wake once and in order", () =>
  Effect.gen(function* () {
    const { hub, reasons, accountChanged } = yield* harness(3);
    hub.wakeBroker();
    accountChanged();
    hub.wakeBroker();
    expect(Array.from(yield* Fiber.join(reasons))).toEqual([
      "broker-availability-changed",
      "credentials-changed",
      "broker-availability-changed",
    ]);
  }),
);
