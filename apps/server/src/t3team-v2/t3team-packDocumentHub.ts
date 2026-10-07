import type {
  T3TeamPackDocumentsStreamEvent,
  T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";

export type PackDocumentChange = Exclude<
  T3TeamPackDocumentsStreamEvent,
  { readonly type: "snapshot" }
>;
/** Tells a subscriber it fell behind and must re-read a snapshot. */
export type PackDocumentHubItem = PackDocumentChange | { readonly type: "resync" };

/** Pending changes one subscriber may hold before it is resynced instead of buffered further. */
const PACK_DOCUMENT_SUBSCRIBER_CAPACITY = 256;

const matchesPackDocumentChange = (
  input: T3TeamSubscribePackDocumentsInput,
  change: PackDocumentChange,
) => {
  const key = change.type === "upsert" ? change.doc.key : change.key;
  return (
    change.packId === input.packId &&
    change.collection === input.collection &&
    (input.key === undefined || key === input.key) &&
    key.startsWith(input.prefix ?? "")
  );
};

/**
 * Fans changes out to per-subscriber bounded queues, filtered at publish time so unrelated traffic
 * never fills a subscriber. A full queue is cleared and replaced by one `resync` marker: memory
 * stays bounded and a slow subscriber recovers with a fresh snapshot rather than missing changes.
 */
export const makePackDocumentHub = (capacity = PACK_DOCUMENT_SUBSCRIBER_CAPACITY) =>
  Effect.sync(() => {
    const subscribers = new Set<{
      readonly input: T3TeamSubscribePackDocumentsInput;
      readonly queue: Queue.Queue<PackDocumentHubItem>;
    }>();
    const deliver = (
      queue: Queue.Queue<PackDocumentHubItem>,
      change: PackDocumentChange,
    ): Effect.Effect<void> =>
      Queue.offerUnsafe(queue, change)
        ? Effect.void
        : Queue.clear(queue).pipe(Effect.andThen(Queue.offer(queue, { type: "resync" })));
    const publish = (changes: ReadonlyArray<PackDocumentChange>) =>
      Effect.forEach(
        changes,
        (change) =>
          Effect.forEach(
            subscribers,
            (subscriber) =>
              matchesPackDocumentChange(subscriber.input, change)
                ? deliver(subscriber.queue, change)
                : Effect.void,
            { discard: true },
          ),
        { discard: true },
      );
    const subscribe = (input: T3TeamSubscribePackDocumentsInput) =>
      Effect.acquireRelease(
        Queue.bounded<PackDocumentHubItem>(capacity).pipe(
          Effect.flatMap((queue) =>
            Effect.sync(() => {
              const entry = { input, queue };
              subscribers.add(entry);
              return entry;
            }),
          ),
        ),
        (entry) =>
          Effect.sync(() => subscribers.delete(entry)).pipe(
            Effect.andThen(Queue.shutdown(entry.queue)),
          ),
      ).pipe(Effect.map((entry): Queue.Dequeue<PackDocumentHubItem> => entry.queue));
    return { publish, subscribe };
  });
export type PackDocumentHub = Effect.Success<ReturnType<typeof makePackDocumentHub>>;
