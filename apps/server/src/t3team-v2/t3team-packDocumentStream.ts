import type {
  T3TeamPackDocument,
  T3TeamPackDocumentsStreamEvent,
  T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

export type PackDocumentChange = Exclude<
  T3TeamPackDocumentsStreamEvent,
  { readonly type: "snapshot" }
>;

/** Subscribe first: writes during the snapshot read are buffered and delivered afterwards. */
export function packDocumentStream<E>(
  changes: PubSub.PubSub<PackDocumentChange>,
  input: T3TeamSubscribePackDocumentsInput,
  snapshot: Effect.Effect<ReadonlyArray<T3TeamPackDocument>, E>,
): Stream.Stream<T3TeamPackDocumentsStreamEvent, E> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(changes);
      const documents = yield* snapshot;
      const live = Stream.fromSubscription(subscription).pipe(
        Stream.filter((event) => {
          const key = event.type === "upsert" ? event.doc.key : event.key;
          return (
            event.packId === input.packId &&
            event.collection === input.collection &&
            (input.key === undefined || key === input.key) &&
            key.startsWith(input.prefix ?? "")
          );
        }),
      );
      return Stream.concat(
        Stream.succeed<T3TeamPackDocumentsStreamEvent>({
          type: "snapshot",
          packId: input.packId,
          collection: input.collection,
          documents,
        }),
        live,
      );
    }),
  );
}
