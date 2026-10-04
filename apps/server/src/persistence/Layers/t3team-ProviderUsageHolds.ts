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

  // An active row keeps the user-owned toggle and its original `since`; a
  // released row is re-armed from the new values.
  const upsertActiveHold = SqlSchema.void({
    Request: ProviderUsageHold,
    execute: (row) =>
      sql`
        INSERT INTO provider_usage_holds (
          thread_id, provider, provider_instance_id, since, resets_at, auto_resume,
          pending_turn_message_id, released_at, release_reason, updated_at
        )
        VALUES (
          ${row.threadId}, ${row.provider}, ${row.providerInstanceId}, ${row.since},
          ${row.resetsAt}, ${row.autoResume ? 1 : 0}, ${row.pendingTurnMessageId},
          NULL, NULL, ${row.updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          provider = excluded.provider,
          provider_instance_id = excluded.provider_instance_id,
          resets_at = excluded.resets_at,
          pending_turn_message_id = excluded.pending_turn_message_id,
          since = CASE WHEN released_at IS NULL THEN since ELSE excluded.since END,
          auto_resume = CASE WHEN released_at IS NULL THEN auto_resume ELSE excluded.auto_resume END,
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

  // Conditional update + RETURNING: only the caller whose update flipped the
  // row sees it back, which makes the release a claim.
  const markReleasedRow = SqlSchema.findAll({
    Request: Schema.Struct({
      threadId: Schema.String,
      reason: Schema.String,
      now: Schema.String,
    }),
    Result: Schema.Struct({ threadId: Schema.String }),
    execute: ({ threadId, reason, now }) =>
      sql`
        UPDATE provider_usage_holds
        SET released_at = ${now},
            release_reason = ${reason},
            updated_at = ${now}
        WHERE thread_id = ${threadId}
          AND released_at IS NULL
        RETURNING thread_id AS "threadId"
      `,
  });

  const markReleased: ProviderUsageHoldRepositoryShape["markReleased"] = (input) =>
    markReleasedRow({
      threadId: input.threadId,
      reason: input.reason,
      now: input.now,
    }).pipe(
      Effect.flatMap((claimed) =>
        claimed.length === 0
          ? Effect.succeedNone
          : getHoldRow({ threadId: input.threadId }).pipe(Effect.map(toHoldOption)),
      ),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.markReleased:query")),
    );

  return {
    upsertActiveHold: upsert,
    setAutoResume,
    getByThreadId,
    listActive: activeReads.listActive,
    markReleased,
    listActiveSessionThreadsForInstance: activeReads.listActiveSessionThreadsForInstance,
  } satisfies ProviderUsageHoldRepositoryShape;
});

export const ProviderUsageHoldRepositoryLive = Layer.effect(
  ProviderUsageHoldRepository,
  makeProviderUsageHoldRepository,
);
