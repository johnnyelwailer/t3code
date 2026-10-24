/**
 * Follows one turn of a `remoteEnvironment` session on the cloud session's server: connects,
 * pre-flights (`t3team-remoteEnvironmentPrepare.ts`), creates the remote thread, sends the turn
 * under the local message id, and publishes the remote run's progress as local events until it
 * ends. A dropped connection is retried with backoff and the same commands; whatever ends the turn
 * is emitted exactly once, and a follower that dies unexpectedly still ends the turn as failed.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import type {
  RemoteEnvironmentSessionDeps,
  RemoteThreadView,
  RemoteEnvironmentGrant,
} from "./t3team-remoteEnvironmentApiTypes.ts";
import {
  pendingApproval,
  prepareRemoteThread,
  retryable,
  terminalFor,
} from "./t3team-remoteEnvironmentPrepare.ts";
import { makeRemoteTurnEvents } from "./t3team-remoteEnvironmentTurnEvents.ts";
import { remoteTurnProgress, type RemoteTurnTerminal } from "./t3team-remoteEnvironmentTurn.ts";
import type { TurnState } from "./t3team-remoteEnvironmentTurnState.ts";

const RECONNECT_ATTEMPTS = 5;

/** What a follower needs from its session: the connection, where events go, and the clock. */
export interface RemoteFollowEnv {
  readonly deps: RemoteEnvironmentSessionDeps;
  readonly emit: (events: ReadonlyArray<ProviderAdapterV2Event>) => Effect.Effect<unknown>;
  readonly nowIso: () => string;
}

export const followTurn = Effect.fn("remoteEnvironment.followTurn")(function* (
  { deps, emit, nowIso }: RemoteFollowEnv,
  turn: ProviderAdapterV2TurnInput,
  target: RemoteEnvironmentGrant,
  state: TurnState,
) {
  const events = makeRemoteTurnEvents(turn, nowIso);
  const emitted = yield* Ref.make(new Map<string, string>());
  const prepared = yield* Ref.make(false);
  let assistantCount = 0;
  const publish = Effect.fn("remoteEnvironment.publish")(function* (projection: RemoteThreadView) {
    const progress = remoteTurnProgress(projection, turn.message.messageId);
    if (progress.runId !== null) yield* Ref.set(state.runId, progress.runId);
    assistantCount = progress.assistant.length;
    const seen = yield* Ref.get(emitted);
    const changed = progress.assistant.filter((message) => seen.get(message.id) !== message.text);
    if (changed.length > 0 && progress.terminal === null) {
      yield* emit(yield* Effect.orDie(events.assistant(changed, true)));
      yield* Ref.set(
        emitted,
        new Map(progress.assistant.map((message) => [message.id, message.text])),
      );
    }
    if (progress.terminal !== null) {
      if (progress.assistant.length > 0)
        yield* emit(yield* Effect.orDie(events.assistant(progress.assistant, false)));
      return Option.some(progress.terminal);
    }
    if (pendingApproval(projection, progress.runId)) {
      return Option.some<RemoteTurnTerminal>({
        status: "failed",
        message:
          "The child asked for an approval on the cloud session, which cannot be answered from here.",
      });
    }
    return Option.none<RemoteTurnTerminal>();
  });
  const attempt = Effect.scoped(
    Effect.gen(function* () {
      const api = yield* deps.open(target.sessionId);
      if (!(yield* Ref.get(prepared))) {
        yield* prepareRemoteThread(api, turn, target);
        yield* Ref.set(prepared, true);
      }
      yield* api.dispatchMessage({
        threadId: turn.threadId,
        messageId: turn.message.messageId,
        text: turn.message.text,
        modelSelection: target.modelSelection,
      });
      const first = yield* publish(yield* api.projection(turn.threadId));
      if (Option.isSome(first)) return first.value;
      const next = yield* api.updates(turn.threadId).pipe(
        Stream.mapEffect(() => Effect.flatMap(api.projection(turn.threadId), publish)),
        Stream.filter(Option.isSome),
        Stream.map((terminal) => terminal.value),
        Stream.runHead,
      );
      if (Option.isSome(next)) return next.value;
      return yield* Effect.fail(
        new CloudSessionFailedError({
          reason: "unknown_session",
          message: "The thread stream ended.",
        }),
      );
    }),
  );
  const terminal = yield* attempt.pipe(
    Effect.retry({
      times: deps.reconnectAttempts ?? RECONNECT_ATTEMPTS,
      schedule: Schedule.exponential("1 second"),
      while: retryable,
    }),
    Effect.catch((error) => Effect.succeed(terminalFor(error))),
  );
  if (yield* Deferred.succeed(state.ended, undefined)) {
    yield* emit(yield* Effect.orDie(events.terminal(terminal, assistantCount)));
  }
});

/** The follower the session forks: it never fails, and interrupting it interrupts the remote run. */
