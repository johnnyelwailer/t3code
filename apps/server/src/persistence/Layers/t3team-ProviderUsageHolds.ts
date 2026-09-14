/**
 * SQLite implementation of the provider-usage hold repository.
 *
 * Row typing follows the persistence-layer convention: each read goes through
 * a `SqlSchema` helper with an explicit result schema (camelCase aliases),
 * then maps to the branded `ProviderUsageHold` value. Row schemas and the
 * "list" reads live in the sibling `t3team-ProviderUsageHoldsRow` and
 * `t3team-ProviderUsageHoldsActiveReads` modules.
 *
 * @module t3team.persistence.Layers.ProviderUsageHolds
 */
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { toPersistenceSqlError } from "../Errors.ts";

import {
  ProviderUsageHold,
  ProviderUsageHoldRepository,
  type ProviderUsageHoldRepositoryShape,
} from "../Services/t3team-ProviderUsageHolds.ts";

import {
  ByThreadIdRequest,
  ProviderUsageHoldDbRow,
  toHoldOption,
} from "./t3team-ProviderUsageHoldsRow.ts";
import { makeProviderUsageHoldActiveReads } from "./t3team-ProviderUsageHoldsActiveReads.ts";

const makeProviderUsageHoldRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const activeReads = makeProviderUsageHoldActiveReads(sql);

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
      FROM provider_usage_holds
      WHERE thread_id = ${threadId}
      `,
  });

  const upsert: ProviderUsageHoldRepositoryShape["upsertActiveHold"] = (row) =>
    upsertActiveHold(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.upsertActiveHold:query")),
    );

  const setPendingTurnRow = SqlSchema.void({
    Request: Schema.Struct({
      threadId: Schema.String,
      messageId: Schema.String,
      now: Schema.String,
    }),
    execute: ({ threadId, messageId, now }) =>
      sql`
        UPDATE provider_usage_holds
        SET pending_turn_message_id = ${messageId},
            updated_at = ${now}
        WHERE thread_id = ${threadId}
          AND released_at IS NULL
      `,
  });

  const setPendingTurn: ProviderUsageHoldRepositoryShape["setPendingTurn"] = (input) =>
    setPendingTurnRow({
      threadId: input.threadId,
      messageId: input.messageId,
      now: input.now,
    }).pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.setPendingTurn:query")),
    );

  const setAutoResumeRow = SqlSchema.void({
    Request: Schema.Struct({
      threadId: Schema.String,
      autoResume: Schema.Number,
      now: Schema.String,
    }),
    execute: ({ threadId, autoResume, now }) =>
      sql`
        UPDATE provider_usage_holds
        SET auto_resume = ${autoResume},
            updated_at = ${now}
        WHERE thread_id = ${threadId}
          AND released_at IS NULL
      `,
  });

  const setAutoResume: ProviderUsageHoldRepositoryShape["setAutoResume"] = (input) =>
    setAutoResumeRow({
      threadId: input.threadId,
      autoResume: input.autoResume ? 1 : 0,
      now: input.now,
    }).pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.setAutoResume:query")),
    );

  const getByThreadId: ProviderUsageHoldRepositoryShape["getByThreadId"] = (input) =>
    getHoldRow({ threadId: input.threadId }).pipe(
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.getByThreadId:query")),
    );

  const markReleasedRow = SqlSchema.void({
    Request: Schema.Struct({
      threadId: Schema.String,
      reason: Schema.String,
      now: Schema.String,
    }),
    execute: ({ threadId, reason, now }) =>
      sql`
        UPDATE provider_usage_holds
        SET released_at = ${now},
            release_reason = ${reason},
            updated_at = ${now}
        WHERE thread_id = ${threadId}
          AND released_at IS NULL
      `,
  });

  const markReleased: ProviderUsageHoldRepositoryShape["markReleased"] = (input) =>
    markReleasedRow({
      threadId: input.threadId,
      reason: input.reason,
      now: input.now,
    }).pipe(
      Effect.andThen(() => getHoldRow({ threadId: input.threadId })),
      Effect.map((option) => toHoldOption(option)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.markReleased:query")),
    );

  return {
    upsertActiveHold: upsert,
    setPendingTurn,
    setAutoResume,
    getByThreadId,
    listActive: activeReads.listActive,
    markReleased,
    listActiveSessionThreadsForDriver: activeReads.listActiveSessionThreadsForDriver,
  } satisfies ProviderUsageHoldRepositoryShape;
});

export const ProviderUsageHoldRepositoryLive = Layer.effect(
  ProviderUsageHoldRepository,
  makeProviderUsageHoldRepository,
);
