import type { T3TeamPackDocument } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import type * as Semaphore from "effect/Semaphore";
import type * as SqlClient from "effect/sql/SqlClient";
import type { PackDocumentChange } from "./t3team-packDocumentStream.ts";
import { mapPackDocumentError } from "./t3team-packDocumentValidation.ts";
/** Keep commit and publication ordered; cancellation cannot leave a committed write unpublished. */
export function packDocumentWriter(
  sql: SqlClient.SqlClient,
  changes: PubSub.PubSub<PackDocumentChange>,
  lock: Semaphore.Semaphore,
  packId: string,
) {
  const publish = (collection: string, doc: T3TeamPackDocument) =>
    PubSub.publish(changes, { type: "upsert", packId, collection, doc });
  const write = <A, E>(
    operation: string,
    effect: Effect.Effect<{ value: A; doc: T3TeamPackDocument | null; collection: string }, E>,
  ) =>
    lock
      .withPermits(1)(
        sql.withTransaction(effect).pipe(
          Effect.tap((result) =>
            result.doc ? publish(result.collection, result.doc) : Effect.void,
          ),
          Effect.map((result) => result.value),
          Effect.uninterruptible,
        ),
      )
      .pipe(Effect.mapError(mapPackDocumentError(operation)));

  return write;
}
