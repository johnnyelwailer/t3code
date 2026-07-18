/**
 * Pack driver event bridge.
 *
 * Converts a pack instance's `events()` AsyncIterable into the host's
 * canonical `Stream<ProviderRuntimeEvent>`. Every event is defensively
 * re-stamped with the bridged driver kind + instance id so the strict
 * correlation check in `ProviderService` (which compares `event.provider`
 * against the adapter's `provider`) can never tear the pipeline down, then
 * runtime-decoded against the contracts schema.
 *
 * Undecodable events are dropped and logged rather than crashing the
 * subscription. Because a dropped *terminal* event (turn completed/failed)
 * would otherwise leave a turn spinning forever, when the raw event carries
 * both a string `threadId` and `turnId` we synthesize a canonical
 * `turn.completed` failure so the turn settles. Without a `turnId` we cannot
 * safely target an in-flight turn, so we drop + logError. Iteration failures
 * are logged (error) and terminate the stream cleanly.
 *
 * @module t3work-pack-driverEvents
 */
import {
  ProviderRuntimeEvent,
  type ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Filter from "effect/Filter";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

const decodeEvent = Schema.decodeUnknownOption(ProviderRuntimeEvent);

const restamp = (
  raw: unknown,
  driverKind: ProviderDriverKind,
  instanceId: ProviderInstanceId,
): unknown => {
  if (!raw || typeof raw !== "object") return raw;
  return {
    ...(raw as Record<string, unknown>),
    provider: driverKind,
    providerInstanceId: instanceId,
  };
};

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

/** Extract both ids only when present — required to safely target a live turn. */
const extractTurnIds = (raw: unknown): { threadId: string; turnId: string } | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const threadId = nonEmptyString(record.threadId);
  const turnId = nonEmptyString(record.turnId);
  return threadId && turnId ? { threadId, turnId } : undefined;
};

export const packEventsToStream = (input: {
  readonly events: AsyncIterable<unknown>;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
}): Stream.Stream<ProviderRuntimeEvent> =>
  Stream.fromAsyncIterable(input.events, (cause) => cause).pipe(
    Stream.filterMapEffect(
      Filter.makeEffect((raw: unknown) =>
        Effect.gen(function* () {
          const decoded = decodeEvent(restamp(raw, input.driverKind, input.instanceId));
          if (Option.isSome(decoded)) {
            return Result.succeed(decoded.value);
          }
          const ids = extractTurnIds(raw);
          if (ids) {
            const createdAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
            const synthetic = decodeEvent({
              type: "turn.completed",
              eventId: `pack-undecodable-${ids.threadId}-${ids.turnId}`,
              provider: input.driverKind,
              providerInstanceId: input.instanceId,
              threadId: ids.threadId,
              turnId: ids.turnId,
              createdAt,
              payload: {
                state: "failed",
                errorMessage: "pack provider emitted an undecodable event",
              },
            });
            if (Option.isSome(synthetic)) {
              yield* Effect.logError(
                "Pack provider emitted an undecodable event; synthesizing turn failure",
                { driver: input.driverKind, instanceId: input.instanceId, ...ids },
              );
              return Result.succeed(synthetic.value);
            }
          }
          yield* Effect.logError("Dropping undecodable pack provider event", {
            driver: input.driverKind,
            instanceId: input.instanceId,
          });
          return Result.fail(raw);
        }),
      ),
    ),
    Stream.catchCause((cause) =>
      Stream.fromEffect(
        Effect.logError("Pack provider event stream terminated", {
          driver: input.driverKind,
          instanceId: input.instanceId,
          cause,
        }),
      ).pipe(Stream.drain),
    ),
  );
