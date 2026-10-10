import type {
  T3TeamPackDocument,
  T3TeamPackDocumentsStreamEvent,
  T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { PackDocumentHub } from "./t3team-packDocumentHub.ts";

/**
 * Subscribe first: writes during the snapshot read are buffered and delivered afterwards. A
 * subscriber that overflowed its buffer gets a fresh snapshot, which the client treats as a reset.
 */
export function packDocumentStream<E>(
  hub: PackDocumentHub,
  input: T3TeamSubscribePackDocumentsInput,
  snapshot: Effect.Effect<ReadonlyArray<T3TeamPackDocument>, E>,
): Stream.Stream<T3TeamPackDocumentsStreamEvent, E> {
  const snapshotEvent = snapshot.pipe(
    Effect.map((documents): T3TeamPackDocumentsStreamEvent => ({
      type: "snapshot",
      packId: input.packId,
      collection: input.collection,
      documents,
    })),
  );
  return Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* hub.subscribe(input);
      const first = yield* snapshotEvent;
      const live = Stream.fromQueue(queue).pipe(
        Stream.mapEffect((item) => (item.type === "resync" ? snapshotEvent : Effect.succeed(item))),
      );
      return Stream.concat(Stream.succeed(first), live);
    }),
  );
}
