/**
 * Pack session event bridge.
 *
 * Turns a pack session's `events()` AsyncIterable of `ProviderAdapterV2Event`
 * JSON into the host's adapter event stream. Each event's `driver` is
 * re-stamped with the bridged driver kind, then decoded against the host
 * schema — there is no translation.
 *
 * An undecodable event is dropped and logged, except an undecodable
 * `turn.terminal`: losing a terminal would leave the run spinning, so it fails
 * the stream with a protocol error. The session manager then releases the
 * session (`runtime_error`) and the run settles as failed. A throwing or
 * failing iterable fails the stream the same way. The stream ends when the
 * session scope closes, because a custom iterable does not self-terminate;
 * the pack iterator is then released without awaiting its `return()`.
 *
 * @module t3team-pack-driverEvents
 */
import type { ProviderDriverKind, ProviderSessionId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Filter from "effect/Filter";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  ProviderAdapterEventStreamError,
  ProviderAdapterProtocolError,
  type ProviderAdapterV2Error,
  type ProviderAdapterV2Event,
} from "./orchestration-v2/ProviderAdapter.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";

const decodeEvent = Schema.decodeUnknownOption(PackCodec.event);

const restamp = (raw: unknown, driver: ProviderDriverKind): unknown =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>), driver }
    : raw;

const eventType = (raw: unknown): unknown =>
  raw !== null && typeof raw === "object" ? (raw as { readonly type?: unknown }).type : undefined;

export const packEventsToStream = (input: {
  readonly events: () => AsyncIterable<unknown>;
  readonly driver: ProviderDriverKind;
  readonly providerSessionId: ProviderSessionId;
  /** Completes when the session scope closes. */
  readonly closed: Effect.Effect<void>;
}): Stream.Stream<ProviderAdapterV2Event, ProviderAdapterV2Error> => {
  const { driver, providerSessionId } = input;
  const streamError = (cause: unknown) =>
    new ProviderAdapterEventStreamError({ driver, providerSessionId, cause });
  const toEvent = (
    raw: unknown,
  ): Effect.Effect<Result.Result<ProviderAdapterV2Event, unknown>, ProviderAdapterV2Error> => {
    const decoded = decodeEvent(restamp(raw, driver));
    if (Option.isSome(decoded)) return Effect.succeed(Result.succeed(decoded.value));
    if (eventType(raw) === "turn.terminal") {
      return Effect.fail(
        new ProviderAdapterProtocolError({
          driver,
          detail: "pack provider emitted an undecodable turn.terminal event",
          payload: raw,
        }),
      );
    }
    return Effect.logError("Dropping undecodable pack provider event", {
      driver,
      providerSessionId,
      type: eventType(raw),
    }).pipe(Effect.as(Result.fail(raw)));
  };
  const pulls = Effect.gen(function* () {
    const iterator = yield* Effect.try({
      try: () => input.events()[Symbol.asyncIterator](),
      catch: streamError,
    });
    // An async-generator `return()` does not settle while the generator is suspended inside its
    // own `await`, so a pack iterator is released without waiting (fire-and-forget).
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        void iterator.return?.()?.catch(() => undefined);
      }),
    );
    return Stream.fromEffectRepeat(
      Effect.tryPromise({ try: () => iterator.next(), catch: streamError }).pipe(
        Effect.flatMap((next) => (next.done ? Cause.done() : Effect.succeed(next.value))),
      ),
    );
  });
  return Stream.unwrap(pulls).pipe(
    Stream.filterMapEffect(Filter.makeEffect(toEvent)),
    Stream.interruptWhen(input.closed),
  );
};
