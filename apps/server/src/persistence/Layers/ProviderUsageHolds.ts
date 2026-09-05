/**
 * SQLite implementation of the provider-usage hold repository.
 *
 * Row typing follows the persistence-layer convention: each read goes through
 * a `SqlSchema` helper with an explicit result schema (camelCase aliases),
 * then maps to the branded `ProviderUsageHold` value.
 *
 * @module t3team.persistence.Layers.ProviderUsageHolds
 */
import { MessageId, ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { toPersistenceSqlError } from "../Errors.ts";

import { ProviderUsageHold, ProviderUsageHoldRepository, type ProviderUsageHoldRepositoryShape } from "../Services/ProviderUsageHolds.ts";

/** SQLite row shape (camelCase aliases; `auto_resume` is a 0/1 integer). */
const ProviderUsageHoldDbRow = Schema.Struct({
  threadId: Schema.String,
  provider: Schema.String,
  providerInstanceId: Schema.NullOr(Schema.String),
  since: Schema.String,
  resetsAt: Schema.NullOr(Schema.String),
  autoResume: Schema.Number,
  pendingTurnMessageId: Schema.NullOr(Schema.String),
  releasedAt: Schema.NullOr(Schema.String),
  releaseReason: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
type ProviderUsageHoldDbRowValue = typeof ProviderUsageHoldDbRow.Type;

const HOLD_SELECT = `
        thread_id AS "threadId",
        provider,
        provider_instance_id AS "providerInstanceId",
        since,
        resets_at AS "resetsAt",
        auto_resume AS "autoResume",
        pending_turn_message_id AS "pendingTurnMessageId",
        released_at AS "releasedAt",
        release_reason AS "releaseReason",
        updated_at AS "updatedAt"
`;

const rowToHold = (row: ProviderUsageHoldDbRowValue): ProviderUsageHold => ({
  threadId: ThreadId.make(row.threadId),
  provider: ProviderDriverKind.make(row.provider),
  providerInstanceId:
    row.providerInstanceId === null ? null : ProviderInstanceId.make(row.providerInstanceId),
  since: row.since,
  resetsAt: row.resetsAt,
  autoResume: row.autoResume === 1,
  pendingTurnMessageId:
    row.pendingTurnMessageId === null ? null : MessageId.make(row.pendingTurnMessageId),
  releasedAt: row.releasedAt,
  releaseReason: row.releaseReason,
  updatedAt: row.updatedAt,
});

const toHoldOption = (option: Option.Option<ProviderUsageHoldDbRowValue>) =>
  Option.map(rowToHold)(option);

const ByThreadIdRequest = Schema.Struct({ threadId: Schema.String });

const EmptyRequest = Schema.Struct({});

const makeProviderUsageHoldRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Re-arming an existing (or released) row must preserve the user-owned
  // fields: the auto-resume toggle, the pending turn, and the original
  // `since` timestamp. The watcher refreshes the provider-facing fields only.
  const upsertActiveHold = SqlSchema.void({
    Request: ProviderUsageHold,
    execute: (row) =>
      sql`
        INSERT INTO provider_usage_holds (
          thread_id,
          provider,
          provider_instance_id,
          since,
          resets_at,
          auto_resume,
          pending_turn_message_id,
          released_at,
          release_reason,
          updated_at
        )
        VALUES (
          ${row.threadId},
          ${row.provider},
          ${row.providerInstanceId},
          ${row.since},
          ${row.resetsAt},
          ${row.autoResume ? 1 : 0},
          ${row.pendingTurnMessageId},
          NULL,
          NULL,
          ${row.updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          provider = excluded.provider,
          provider_instance_id = excluded.provider_instance_id,
          resets_at = excluded.resets_at,
          updated_at = excluded.updated_at,
          released_at = NULL,
          release_reason = NULL
      `,
  });

  const getHoldRow = SqlSchema.findOneOption({
    Request: ByThreadIdRequest,
    Result: ProviderUsageHoldDbRow,
    execute: ({ threadId }) =>
      sql`
        SELECT
${HOLD_SELECT}
      FROM provider_usage_holds
      WHERE thread_id = ${threadId}
      `,
  });

  const listActiveRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: ProviderUsageHoldDbRow,
    execute: () =>
      sql`
        SELECT
${HOLD_SELECT}
      FROM provider_usage_holds
      WHERE released_at IS NULL
      ORDER BY since ASC
      `,
  });

  const activeSessionThreadsForDriver = SqlSchema.findAll({
    Request: Schema.Struct({ provider: Schema.String }),
    Result: Schema.Struct({ threadId: Schema.String }),
    execute: ({ provider }) =>
      sql`
        SELECT DISTINCT s.thread_id AS "threadId"
        FROM projection_thread_sessions s
        WHERE s.provider_name = ${provider}
          AND s.status != 'stopped'
        ORDER BY s.updated_at DESC
      `,
  });

  const upsert: ProviderUsageHoldRepositoryShape["upsertActiveHold"] = (row) =>
    upsertActiveHold(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.upsertActiveHold:query")),
    );

  const setPendingTurn: ProviderUsageHoldRepositoryShape["setPendingTurn"] = (input) =>
    sql`
      UPDATE provider_usage_holds
      SET pending_turn_message_id = ${input.messageId},
          updated_at = ${input.now}
      WHERE thread_id = ${input.threadId}
        AND released_at IS NULL
    `.pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(
        toPersistenceSqlError("ProviderUsageHoldRepository.setPendingTurn:query"),
      ),
    );

  const setAutoResume: ProviderUsageHoldRepositoryShape["setAutoResume"] = (input) =>
    sql`
      UPDATE provider_usage_holds
      SET auto_resume = ${input.autoResume ? 1 : 0},
          updated_at = ${input.now}
      WHERE thread_id = ${input.threadId}
        AND released_at IS NULL
    `.pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(
        toPersistenceSqlError("ProviderUsageHoldRepository.setAutoResume:query"),
      ),
    );

  const getByThreadId: ProviderUsageHoldRepositoryShape["getByThreadId"] = (input) =>
    getHoldRow({ threadId: input.threadId }).pipe(
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(
        toPersistenceSqlError("ProviderUsageHoldRepository.getByThreadId:query"),
      ),
    );

  const listActive: ProviderUsageHoldRepositoryShape["listActive"] = () =>
    listActiveRows({}).pipe(
      Effect.map((rows) => rows.map(rowToHold)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.listActive:query")),
    );

  const markReleased: ProviderUsageHoldRepositoryShape["markReleased"] = (input) =>
    sql`
      UPDATE provider_usage_holds
      SET released_at = ${input.now},
          release_reason = ${input.reason},
          updated_at = ${input.now}
      WHERE thread_id = ${input.threadId}
        AND released_at IS NULL
    `.pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.markReleased:query")),
    );

  const listActiveSessionThreadsForDriver: ProviderUsageHoldRepositoryShape["listActiveSessionThreadsForDriver"] =
    (input) =>
      activeSessionThreadsForDriver({ provider: input.provider }).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "ProviderUsageHoldRepository.listActiveSessionThreadsForDriver:query",
          ),
        ),
      );

  return {
    upsertActiveHold: upsert,
    setPendingTurn,
    setAutoResume,
    getByThreadId,
    listActive,
    markReleased,
    listActiveSessionThreadsForDriver,
  } satisfies ProviderUsageHoldRepositoryShape;
});

export const ProviderUsageHoldRepositoryLive = Layer.effect(
  ProviderUsageHoldRepository,
  makeProviderUsageHoldRepository,
);
