/**
 * SQLite layer for {@link ThreadTaskRecordRepository} — the durable per-thread
 * task journal. See `../Migrations/t3team-056_ThreadTaskRecords.ts` for why the
 * table exists and `../Services/t3team-ThreadTaskRecords.ts` for why the shape
 * is only replace + list.
 *
 * @module ThreadTaskRecordRepositoryLive
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ListThreadTaskRecordsInput,
  type TaskRecord,
  ThreadTaskRecordRepository,
  type ThreadTaskRecordRepositoryShape,
} from "../Services/t3team-ThreadTaskRecords.ts";

/**
 * The row as SQLite hands it back. `active_form` / `note` are nullable columns,
 * so they decode as `string | null` and are folded into the contract's OPTIONAL
 * fields below. Decoding them directly as `Schema.optional` would reject the
 * `null` SQLite actually returns.
 */
const ThreadTaskRecordDbRow = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  position: Schema.Number,
  subject: Schema.String,
  activeForm: Schema.NullOr(Schema.String),
  status: Schema.String,
  note: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const makeThreadTaskRecordRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const deleteRowsForThread = SqlSchema.void({
    Request: Schema.Struct({ threadId: Schema.String }),
    execute: ({ threadId }) => sql`DELETE FROM thread_task_records WHERE thread_id = ${threadId}`,
  });

  const insertRow = SqlSchema.void({
    Request: Schema.Struct({
      id: Schema.String,
      threadId: Schema.String,
      position: Schema.Number,
      subject: Schema.String,
      activeForm: Schema.NullOr(Schema.String),
      status: Schema.String,
      note: Schema.NullOr(Schema.String),
      createdAt: Schema.String,
      updatedAt: Schema.String,
    }),
    execute: (row) =>
      sql`
        INSERT INTO thread_task_records (
          id,
          thread_id,
          position,
          subject,
          active_form,
          status,
          note,
          created_at,
          updated_at
        )
        VALUES (
          ${row.id},
          ${row.threadId},
          ${row.position},
          ${row.subject},
          ${row.activeForm},
          ${row.status},
          ${row.note},
          ${row.createdAt},
          ${row.updatedAt}
        )
      `,
  });

  const listRowsForThread = SqlSchema.findAll({
    Request: ListThreadTaskRecordsInput,
    Result: ThreadTaskRecordDbRow,
    execute: ({ threadId }) =>
      sql`
        SELECT
          id,
          thread_id AS "threadId",
          position,
          subject,
          active_form AS "activeForm",
          status,
          note,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM thread_task_records
        WHERE thread_id = ${threadId}
        ORDER BY position ASC
      `,
  });

  // Delete-then-insert inside ONE transaction. Without it a concurrent reader
  // could land between the two statements and see an empty journal, which is
  // indistinguishable from "this agent has no plan" — the exact state the
  // feature exists to make impossible.
  const replaceForThread: ThreadTaskRecordRepositoryShape["replaceForThread"] = ({
    threadId,
    tasks,
  }) =>
    sql
      .withTransaction(
        deleteRowsForThread({ threadId }).pipe(
          Effect.flatMap(() =>
            Effect.forEach(
              tasks,
              (task) =>
                insertRow({
                  id: task.id,
                  threadId: task.threadId,
                  position: task.position,
                  subject: task.subject,
                  activeForm: task.activeForm ?? null,
                  status: task.status,
                  note: task.note ?? null,
                  createdAt: task.createdAt,
                  updatedAt: task.updatedAt,
                }),
              { discard: true },
            ),
          ),
        ),
      )
      .pipe(
        Effect.mapError(toPersistenceSqlError("ThreadTaskRecordRepository.replaceForThread:query")),
      );

  const listForThread: ThreadTaskRecordRepositoryShape["listForThread"] = (input) =>
    listRowsForThread(input).pipe(
      Effect.map((rows) =>
        rows.map(
          (row) =>
            ({
              id: row.id,
              threadId: row.threadId,
              position: row.position,
              subject: row.subject,
              ...(row.activeForm === null ? {} : { activeForm: row.activeForm }),
              status: row.status,
              ...(row.note === null ? {} : { note: row.note }),
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }) as TaskRecord,
        ),
      ),
      Effect.mapError(toPersistenceSqlError("ThreadTaskRecordRepository.listForThread:query")),
    );

  return { replaceForThread, listForThread } satisfies ThreadTaskRecordRepositoryShape;
});

export const ThreadTaskRecordRepositoryLive = Layer.effect(
  ThreadTaskRecordRepository,
  makeThreadTaskRecordRepository,
);
