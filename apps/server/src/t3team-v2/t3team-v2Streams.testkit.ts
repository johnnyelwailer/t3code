import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

/**
 * Forks a collector over a snapshot-first stream and returns once the snapshot
 * arrived, so the live subscription behind it is open before the test writes.
 */
export const collectAfterSnapshot = <A extends { readonly type: string }, E>(
  stream: Stream.Stream<A, E>,
  count: number,
) =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>();
    const fiber = yield* stream.pipe(
      Stream.tap((event) =>
        event.type === "snapshot" ? Deferred.succeed(ready, undefined) : Effect.void,
      ),
      Stream.take(count),
      Stream.runCollect,
      Effect.forkScoped,
    );
    yield* Deferred.await(ready);
    return fiber;
  });
