import type { T3TeamPackDocument } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as Semaphore from "effect/Semaphore";
import type * as SqlClient from "effect/sql/SqlClient";
import type { PackDocumentChange, PackDocumentHub } from "./t3team-packDocumentHub.ts";
import { mapPackDocumentError } from "./t3team-packDocumentValidation.ts";

/** What one committed write announces to subscribers, in commit order. */
export interface PackDocumentWriteResult<A> {
  readonly value: A;
  readonly changes: ReadonlyArray<PackDocumentChange>;
}

export const upsertChange = (
  packId: string,
  collection: string,
  doc: T3TeamPackDocument | null,
): ReadonlyArray<PackDocumentChange> =>
  doc === null ? [] : [{ type: "upsert", packId, collection, doc }];

export const removedChanges = (
  packId: string,
  rows: ReadonlyArray<{ readonly collection: string; readonly key: string }>,
): ReadonlyArray<PackDocumentChange> =>
  rows.map((row) => ({ type: "removed", packId, collection: row.collection, key: row.key }));

/** Keep commit and publication ordered; cancellation cannot leave a committed write unpublished. */
export function packDocumentWriter(
  sql: SqlClient.SqlClient,
  hub: PackDocumentHub,
  lock: Semaphore.Semaphore,
) {
  return <A, E>(operation: string, effect: Effect.Effect<PackDocumentWriteResult<A>, E>) =>
    lock
      .withPermits(1)(
        sql.withTransaction(effect).pipe(
          Effect.tap((result) => hub.publish(result.changes)),
          Effect.map((result) => result.value),
          Effect.uninterruptible,
        ),
      )
      .pipe(Effect.mapError(mapPackDocumentError(operation)));
}
