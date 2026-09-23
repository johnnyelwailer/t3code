/**
 * "List" read operations of the provider-usage hold SQLite repository
 * (split out of `t3team-ProviderUsageHolds.ts`): listing active holds and
 * listing the active session threads for a driver. Built from a `SqlClient`
 * so the repository generator can compose them alongside the write path.
 *
 * @module t3team.persistence.Layers.ProviderUsageHoldsActiveReads
 */
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";

import { toPersistenceSqlError } from "../Errors.ts";

import { type ProviderUsageHoldRepositoryShape } from "../Services/t3team-ProviderUsageHolds.ts";

import { EmptyRequest, ProviderUsageHoldDbRow, rowToHold } from "./t3team-ProviderUsageHoldsRow.ts";

export const makeProviderUsageHoldActiveReads = (sql: SqlClient.SqlClient) => {
  const listActiveRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: ProviderUsageHoldDbRow,
    execute: () =>
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

  const listActive: ProviderUsageHoldRepositoryShape["listActive"] = () =>
    listActiveRows({}).pipe(
      Effect.map((rows) => rows.map(rowToHold)),
      Effect.mapError(toPersistenceSqlError("ProviderUsageHoldRepository.listActive:query")),
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

  return { listActive, listActiveSessionThreadsForDriver };
};
