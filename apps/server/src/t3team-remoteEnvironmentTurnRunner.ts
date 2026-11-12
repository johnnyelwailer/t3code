/**
 * One turn of a `remoteEnvironment` session from start to terminal: refuse what cannot run on a
 * cloud session (attachments, a thread this server did not place there), otherwise follow the
 * remote run (`t3team-remoteEnvironmentFollow.ts`). It never fails, and interrupting it interrupts
 * the remote run.
 */
import type { ProviderAdapterV2TurnInput } from "@t3tools/provider-core/server/ProviderAdapter";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { followTurn, type RemoteFollowEnv } from "./t3team-remoteEnvironmentFollow.ts";
import { RemoteEnvironmentRejected, terminalFor } from "./t3team-remoteEnvironmentPrepare.ts";
import { makeRemoteTurnEvents } from "./t3team-remoteEnvironmentTurnEvents.ts";
import { remoteInterrupt, type TurnState } from "./t3team-remoteEnvironmentTurnState.ts";

/** Refuses what cannot run there (attachments, an unauthorized thread) before anything connects. */
const authorizeTurn = Effect.fn("remoteEnvironment.authorizeTurn")(function* (
  env: RemoteFollowEnv,
  turn: ProviderAdapterV2TurnInput,
  state: TurnState,
) {
  if (turn.message.attachments.length > 0) {
    return yield* new RemoteEnvironmentRejected({
      reason: "attachments",
      message:
        "Attachments cannot be sent to a cloud session yet; send their content as text instead.",
    });
  }
  const grant = yield* env.deps.authorize(turn);
  yield* Ref.set(state.sessionId, grant.sessionId);
  return grant;
});

const runTurn = Effect.fn("remoteEnvironment.runTurn")(function* (
  env: RemoteFollowEnv,
  turn: ProviderAdapterV2TurnInput,
  state: TurnState,
) {
  const events = makeRemoteTurnEvents(turn, env.nowIso);
  yield* env.emit([yield* Effect.orDie(events.running())]);
  const grant = yield* Effect.result(authorizeTurn(env, turn, state));
  if (grant._tag === "Success") return yield* followTurn(env, turn, grant.success, state);
  if (yield* Deferred.succeed(state.ended, undefined)) {
    yield* env.emit(yield* Effect.orDie(events.terminal(terminalFor(grant.failure), 0)));
  }
});

export const followRemoteTurn = (
  env: RemoteFollowEnv,
  turn: ProviderAdapterV2TurnInput,
  state: TurnState,
) =>
  runTurn(env, turn, state).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("remoteEnvironment turn follower failed", { cause }).pipe(
        Effect.andThen(Deferred.succeed(state.ended, undefined)),
        Effect.flatMap((first) =>
          first
            ? makeRemoteTurnEvents(turn, env.nowIso)
                .terminal(
                  { status: "failed", message: "The child's remote turn failed unexpectedly." },
                  0,
                )
                .pipe(Effect.flatMap(env.emit), Effect.ignore)
            : Effect.void,
        ),
      ),
    ),
    Effect.onInterrupt(() => remoteInterrupt(env.deps, turn.threadId, state)),
  );
