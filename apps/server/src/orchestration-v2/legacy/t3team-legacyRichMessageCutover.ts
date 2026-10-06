/**
 * One-shot fork cutover of the V1 rows the transcript importer cannot carry as
 * messages (see `t3team-legacyRichMessages.ts` for the mapping):
 *
 * - system-row attachments (widgets, decision cards, shape/plan views, resource
 *   refs) and draft proposals → thread artifacts, created at the V1 row's time;
 * - inter-agent deliveries still pending at shutdown → `t3team_thread_mailbox`
 *   entries, with the recipient HELD as V1's restart rehydrate held it: nothing
 *   is delivered on upgrade; the digest arrives once the user writes in that
 *   thread again (the hold lifts like a user-stop hold).
 *
 * Runs once per database (ledger step `v1-rich-messages` in `t3team_v2_cutover`),
 * right after the lineage cutover at startup. Every write is idempotent, and a
 * failure leaves the step unledgered, so the next boot finishes it. Threads
 * missing from V2 or deleted there are skipped; a database without the fork ext
 * column has nothing to carry.
 */
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { T3TEAM_ACTOR_MESSAGE_HOP_CAP } from "../../t3team-actorMessageReactorLimits.ts";
import { T3TeamThreadArtifactsStore } from "../../t3team-v2/t3team-threadArtifactsStore.ts";
import { readLegacyExtColumn } from "./t3team-legacyMessageColumns.ts";
import {
  collectPendingV1Deliveries,
  type LegacyActorRow,
  type LegacySystemRow,
  legacySystemRowArtifacts,
} from "./t3team-legacyRichMessages.ts";

const RICH_MESSAGES_CUTOVER_STEP = "v1-rich-messages";

export interface LegacyRichMessageCutoverSummary {
  readonly artifacts: number;
  readonly pendingDeliveries: number;
  readonly heldThreads: number;
}

const SummaryJson = Schema.fromJsonString(Schema.Unknown);

export const runLegacyRichMessageCutover = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const artifactsStore = yield* T3TeamThreadArtifactsStore;

  const carry = (ext: string) =>
    Effect.gen(function* () {
      const extSql = sql.literal(ext);
      const live = new Set(
        (yield* sql<{ readonly threadId: string }>`
          SELECT thread_id AS "threadId" FROM orchestration_v2_projection_threads
          WHERE deleted_at IS NULL
        `).map((row) => row.threadId),
      );
      const systemRows = yield* sql<
        Omit<LegacySystemRow, "visible"> & { readonly visible: number }
      >`
        SELECT message_id AS "messageId", thread_id AS "threadId", text, ${extSql} AS "extJson",
          created_at AS "createdAt",
          COALESCE(json_extract(${extSql}, '$.visibleToUser'), 1) <> 0 AS "visible"
        FROM projection_thread_messages
        WHERE role = 'system' AND json_valid(${extSql})
          AND json_type(${extSql}, '$.attachments') = 'array'
        ORDER BY created_at ASC, message_id ASC
      `;
      let artifactCount = 0;
      for (const row of systemRows) {
        if (!live.has(row.threadId)) continue;
        for (const artifact of legacySystemRowArtifacts({ ...row, visible: row.visible !== 0 })) {
          yield* artifactsStore.upsert(artifact);
          artifactCount += 1;
        }
      }

      const actorRows = yield* sql<LegacyActorRow>`
        SELECT message_id AS "messageId", thread_id AS "threadId", role, text,
          ${extSql} AS "extJson", created_at AS "createdAt"
        FROM projection_thread_messages
        WHERE role IN ('actor', 'user') AND json_valid(${extSql})
          AND json_type(${extSql}, '$.actor') = 'object'
        ORDER BY created_at ASC, message_id ASC
      `;
      const pending = collectPendingV1Deliveries(actorRows, T3TEAM_ACTOR_MESSAGE_HOP_CAP).filter(
        (delivery) => live.has(delivery.toThreadId),
      );
      const held = [...new Set(pending.map((delivery) => delivery.toThreadId))];
      const heldAt = DateTime.formatIso(yield* DateTime.now);
      // Holds first: an entry must never be visible to the delivery sweep un-held.
      yield* sql.withTransaction(
        Effect.gen(function* () {
          for (const threadId of held) {
            yield* sql`INSERT INTO t3team_thread_mailbox_holds (thread_id, held_at)
              VALUES (${threadId}, ${heldAt}) ON CONFLICT(thread_id) DO NOTHING`;
          }
          for (const entry of pending) {
            yield* sql`INSERT INTO t3team_thread_mailbox (message_id, to_thread_id, from_thread_id,
                from_title, text, summary, urgency, hop_count, root_thread_id, state, created_at)
              VALUES (${entry.messageId}, ${entry.toThreadId}, ${entry.fromThreadId},
                ${entry.fromTitle}, ${entry.text}, ${entry.summary ?? null}, ${entry.urgency},
                ${entry.hopCount}, ${entry.rootThreadId}, 'pending', ${entry.createdAt})
              ON CONFLICT(message_id) DO NOTHING`;
          }
        }),
      );
      return {
        artifacts: artifactCount,
        pendingDeliveries: pending.length,
        heldThreads: held.length,
      } satisfies LegacyRichMessageCutoverSummary;
    });

  const done = yield* sql<{ readonly step: string }>`
    SELECT step FROM t3team_v2_cutover WHERE step = ${RICH_MESSAGES_CUTOVER_STEP}
  `;
  if (done.length > 0) return null;
  const ext = yield* readLegacyExtColumn;
  const summary: LegacyRichMessageCutoverSummary =
    ext === undefined ? { artifacts: 0, pendingDeliveries: 0, heldThreads: 0 } : yield* carry(ext);
  const summaryJson = yield* Schema.encodeEffect(SummaryJson)(summary);
  yield* sql`
    INSERT INTO t3team_v2_cutover (step, applied_at, summary_json)
    VALUES (${RICH_MESSAGES_CUTOVER_STEP}, ${DateTime.formatIso(yield* DateTime.now)}, ${summaryJson})
    ON CONFLICT (step) DO NOTHING
  `;
  yield* Effect.logInfo("t3team carried V1 rich messages and pending deliveries to V2", summary);
  return summary;
}).pipe(
  Effect.catchCause((cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.interrupt
      : Effect.logWarning("t3team V1 rich-message cutover failed; it retries on the next start", {
          cause: Cause.pretty(cause),
        }).pipe(Effect.as(null)),
  ),
  Effect.withSpan("t3team.legacyRichMessageCutover.run"),
);
