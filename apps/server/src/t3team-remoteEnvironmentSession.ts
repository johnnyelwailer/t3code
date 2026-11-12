/**
 * One open `remoteEnvironment` provider session: every turn of the local thread runs as a turn of
 * a thread with the same id on the cloud session's server (`t3team-remoteEnvironmentTarget.ts`).
 *
 * A turn forks a follower in the session scope. It connects, checks once that the session's own
 * project is the child's repository and that the requested provider and model exist there (a
 * mismatch fails the turn; nothing is substituted), creates the remote thread (idempotent), sends
 * the turn under the local message id, and follows the remote run until it ends. Commands carry
 * stable ids, so a dropped connection is retried with backoff and the same commands. When the
 * session cannot be reached again, or has ended, the turn fails with that reason: it never hangs.
 * A local interrupt (or the session closing) interrupts the remote run; a remote interrupt or
 * cancel ends the local turn the same way. A remote approval prompt cannot be answered from here,
 * so it fails the turn with that reason instead of waiting forever.
 */
import {
  type OrchestrationV2ProviderSession,
  type ProviderInstanceId,
  type ProviderSessionId,
  type RunId,
} from "@t3tools/contracts";
import {
  type ProviderAdapterV2Event,
  type ProviderAdapterV2InterruptInput,
  type ProviderAdapterV2SessionRuntime,
  type ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type { RemoteEnvironmentSessionDeps } from "./t3team-remoteEnvironmentApiTypes.ts";
import { followRemoteTurn } from "./t3team-remoteEnvironmentTurnRunner.ts";
import { remoteEnvironmentThreadOperations } from "./t3team-remoteEnvironmentThreads.ts";
import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";
import { makeRemoteTurnEvents } from "./t3team-remoteEnvironmentTurnEvents.ts";
import { remoteInterrupt, type TurnState } from "./t3team-remoteEnvironmentTurnState.ts";

const INTERRUPT_GRACE = "10 seconds";

export const makeRemoteEnvironmentSession = Effect.fn("remoteEnvironment.openSession")(function* (
  deps: RemoteEnvironmentSessionDeps,
  input: {
    readonly instanceId: ProviderInstanceId;
    readonly providerSessionId: ProviderSessionId;
    readonly providerSession: OrchestrationV2ProviderSession;
  },
) {
  const driver = REMOTE_ENVIRONMENT_DRIVER;
  const scope = yield* Effect.scope;
  const queue = yield* Queue.unbounded<ProviderAdapterV2Event>();
  const turns = yield* Ref.make(
    new Map<
      string,
      {
        readonly state: TurnState;
        readonly threadId: ProviderAdapterV2TurnInput["threadId"];
        readonly end: Effect.Effect<void>;
      }
    >(),
  );
  const emit = (events: ReadonlyArray<ProviderAdapterV2Event>) => Queue.offerAll(queue, events);
  const clock = yield* Clock.Clock;
  const nowIso = () => DateTime.formatIso(DateTime.makeUnsafe(clock.currentTimeMillisUnsafe()));
  const startTurn: ProviderAdapterV2SessionRuntime["startTurn"] = Effect.fn(
    "remoteEnvironment.startTurn",
  )(function* (turn: ProviderAdapterV2TurnInput) {
    const key = `provider-turn:${turn.attemptId}`;
    const state: TurnState = {
      sessionId: yield* Ref.make<string | null>(null),
      runId: yield* Ref.make<RunId | null>(null),
      ended: yield* Deferred.make<void>(),
      fiber: yield* Deferred.make<Fiber.Fiber<void>>(),
    };
    const interrupted = makeRemoteTurnEvents(turn, nowIso);
    yield* Ref.update(turns, (current) =>
      new Map(current).set(key, {
        state,
        threadId: turn.threadId,
        end: Effect.flatMap(
          Effect.orDie(interrupted.terminal({ status: "interrupted" }, 0)),
          emit,
        ).pipe(Effect.asVoid),
      }),
    );
    const forget = Ref.update(turns, (current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
    const fiber = yield* Effect.forkIn(
      followRemoteTurn({ deps, emit, nowIso }, turn, state).pipe(Effect.ensuring(forget)),
      scope,
    );
    yield* Deferred.succeed(state.fiber, fiber);
  });

  const interruptTurn: ProviderAdapterV2SessionRuntime["interruptTurn"] = Effect.fn(
    "remoteEnvironment.interruptTurn",
  )(function* (value: ProviderAdapterV2InterruptInput) {
    const turn = (yield* Ref.get(turns)).get(value.providerTurnId);
    if (turn === undefined) return;
    const { state } = turn;
    yield* remoteInterrupt(deps, turn.threadId, state);
    const settled = yield* Deferred.await(state.ended).pipe(
      Effect.timeoutOption(deps.interruptGrace ?? INTERRUPT_GRACE),
    );
    if (Option.isSome(settled)) return;
    if (yield* Deferred.succeed(state.ended, undefined)) {
      const fiber = yield* Deferred.await(state.fiber);
      yield* Fiber.interrupt(fiber);
      yield* turn.end.pipe(Effect.ignore);
    }
  });

  return {
    instanceId: input.instanceId,
    driver,
    providerSessionId: input.providerSessionId,
    providerSession: input.providerSession,
    events: Stream.fromQueue(queue),
    startTurn,
    interruptTurn,
    ...remoteEnvironmentThreadOperations({ ...input, nowIso }),
  } satisfies ProviderAdapterV2SessionRuntime;
});
