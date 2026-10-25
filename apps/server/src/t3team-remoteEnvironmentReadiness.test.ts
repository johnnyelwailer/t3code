import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError, ProviderInstanceId, ProviderSessionId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { placedGrant, providerSession, turn } from "./t3team-remoteEnvironmentSession.fixtures.ts";
import { makeRemoteEnvironmentSession } from "./t3team-remoteEnvironmentSession.ts";

const stillStarting = new CloudSessionFailedError({
  reason: "unknown_session",
  message: "That cloud session is not running yet: it is still starting.",
});

describe("a session that never becomes ready", () => {
  it.effect("fails the turn after one bounded wait (about 15 minutes), not one per reconnect", () =>
    Effect.gen(function* () {
      const opens = yield* Ref.make(0);
      const session = yield* makeRemoteEnvironmentSession(
        {
          open: () =>
            Ref.update(opens, (count) => count + 1).pipe(
              Effect.andThen(Effect.fail(stillStarting)),
            ),
          authorize: placedGrant,
        },
        {
          instanceId: ProviderInstanceId.make("remoteEnvironment"),
          providerSessionId: ProviderSessionId.make("session-1"),
          providerSession,
        },
      );
      yield* session.startTurn(turn);
      const collected = yield* Effect.forkChild(
        session.events.pipe(
          Stream.takeUntil((event) => event.type === "turn.terminal"),
          Stream.runCollect,
        ),
      );
      yield* TestClock.adjust("16 minutes");
      const events = yield* Fiber.join(collected);
      const terminal = events.find((event) => event.type === "turn.terminal");
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.match(terminal.failure.message, /did not become ready within about 15 minutes/);
      }
      assert.strictEqual(yield* Ref.get(opens), 91);
    }).pipe(Effect.scoped),
  );
});
