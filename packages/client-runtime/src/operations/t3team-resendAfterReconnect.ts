import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";
import { isLostReply } from "../t3team-lostReply.ts";

const RESEND_RECONNECT_WAIT = Duration.minutes(2);
const MAX_RESENDS = 3;

const nextSession = (
  supervisor: EnvironmentSupervisor.EnvironmentSupervisor["Service"],
  previous: Option.Option<RpcSession>,
) => {
  const isNew = (session: Option.Option<RpcSession>) =>
    Option.isSome(session) && (Option.isNone(previous) || session.value !== previous.value);
  return Effect.gen(function* () {
    if (isNew(yield* SubscriptionRef.get(supervisor.session))) return;
    yield* SubscriptionRef.changes(supervisor.session).pipe(Stream.filter(isNew), Stream.runHead);
  }).pipe(Effect.timeoutOption(RESEND_RECONNECT_WAIT));
};

/**
 * Sends a command again, with the same command id, once the environment reconnects after the
 * connection was lost. The server answers a known command id from its receipt instead of running
 * it twice. When the connection does not come back, the caller gets the original loss unchanged.
 */
export const resendAfterReconnect = Effect.fn("EnvironmentCommands.resendAfterReconnect")(
  function* <A, E, R>(send: Effect.Effect<A, E, R>) {
    const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
    for (let resends = 0; ; resends += 1) {
      const sentOn = yield* SubscriptionRef.get(supervisor.session);
      const exit = yield* Effect.exit(send);
      if (Exit.isSuccess(exit) || !isLostReply(exit.cause) || resends >= MAX_RESENDS) {
        return yield* exit;
      }
      if (Option.isNone(yield* nextSession(supervisor, sentOn))) return yield* exit;
    }
  },
);
