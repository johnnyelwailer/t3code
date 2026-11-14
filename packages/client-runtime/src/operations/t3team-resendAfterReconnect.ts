import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import { EnvironmentRpcUnavailableError, isRpcClientError } from "../rpc/client.ts";
import type { RpcSession } from "../rpc/session.ts";

const RESEND_RECONNECT_WAIT = Duration.minutes(2);
const MAX_RESENDS = 3;

/**
 * The reply never came and the connection did not come back in time: the server may have run the
 * turn. Retrying with `commandId` is safe; a new command id could run it twice.
 */
export class SendNotConfirmedError extends Schema.TaggedError<SendNotConfirmedError>()(
  "SendNotConfirmedError",
  { commandId: Schema.String },
) {
  override get message(): string {
    return "Could not confirm the message was sent. Retry once the connection is back.";
  }
}

const isNotConnected = Schema.is(EnvironmentRpcUnavailableError);

/**
 * No answer: the connection ended before the reply (the server may have run the command), or
 * there was no connection to send on. Either way the same command id is safe to send again.
 */
function isLostReply<E>(cause: Cause.Cause<E>): boolean {
  if (Cause.hasInterruptsOnly(cause)) return true;
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && (isRpcClientError(error.value) || isNotConnected(error.value));
}

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
 * reply was lost. The server answers a known command id from its receipt instead of running it
 * twice, so the caller learns the real outcome rather than treating a delivered message as failed.
 */
export const resendAfterReconnect = Effect.fn("EnvironmentCommands.resendAfterReconnect")(
  function* <A, E, R>(commandId: string, send: Effect.Effect<A, E, R>) {
    const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
    for (let resends = 0; ; resends += 1) {
      const sentOn = yield* SubscriptionRef.get(supervisor.session);
      const exit = yield* Effect.exit(send);
      if (Exit.isSuccess(exit) || !isLostReply(exit.cause)) return yield* exit;
      const reconnected =
        resends < MAX_RESENDS && Option.isSome(yield* nextSession(supervisor, sentOn));
      if (!reconnected) return yield* new SendNotConfirmedError({ commandId });
    }
  },
);
