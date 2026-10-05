/**
 * One-shot fork cutover after the upstream V1 shell import (critic G3/G9, C15):
 * the importer gives every V1 thread an empty lineage, so the fork's V1
 * parent/child and fork relations would flatten. This pass re-links them on
 * V2 lineage (`subagent` for children, `fork` for forks), carries child tickets
 * into the delegated-child metadata table and `ephemeral` retention and the
 * environment binding into thread facts.
 *
 * Runs once per database (ledger step in `t3team_v2_cutover`, migration 91),
 * right after `reconcileShells` in startup. Each write is idempotent and never
 * overrides a lineage V2 already set. A link V2 refuses (missing or deleted
 * thread, cycle) is skipped; a write that FAILS fails the pass before it is
 * ledgered, and the next boot re-runs it: children linked by the earlier
 * attempt still get their ticket written.
 */
import { ThreadEnvironmentBinding, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { T3TeamChildThreadMetadata } from "../../t3team-childThreadMetadata.ts";
import { T3TeamThreadFactsStore } from "../../t3team-v2/t3team-threadFactsStore.ts";
import { T3TeamThreadLineage } from "../../t3team-v2/t3team-threadLineage.ts";
import {
  orderParentsFirst,
  readLegacyRelations,
  readLegacyThreadFlags,
} from "./t3team-legacyLineageRead.ts";

const LINEAGE_CUTOVER_STEP = "v1-lineage";

export interface LegacyLineageCutoverSummary {
  readonly linked: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly tickets: number;
  readonly facts: number;
}

const decodeEnvironment = Schema.decodeUnknownOption(
  Schema.fromJsonString(ThreadEnvironmentBinding),
);
const SummaryJson = Schema.fromJsonString(Schema.Unknown);

/**
 * Runs the pass unless the ledger already records it. Never fails: an error is
 * logged and the pass retries on the next start (it returns null then, and when
 * the ledger says it already ran).
 */
export const runLegacyLineageCutover = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const lineage = yield* T3TeamThreadLineage;
  const metadata = yield* T3TeamChildThreadMetadata;
  const facts = yield* T3TeamThreadFactsStore;

  /** Live V2 threads and their current lineage parent (null: not linked yet). */
  const liveV2Threads = sql<{ readonly threadId: string; readonly parentThreadId: string | null }>`
    SELECT thread_id AS "threadId",
      json_extract(payload_json, '$.lineage.parentThreadId') AS "parentThreadId"
    FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL
  `.pipe(Effect.map((rows) => new Map(rows.map((row) => [row.threadId, row.parentThreadId]))));

  const apply = Effect.gen(function* () {
    const relations = orderParentsFirst(yield* readLegacyRelations);
    const flags = yield* readLegacyThreadFlags;
    const parentOf = yield* liveV2Threads;
    let linked = 0;
    let unchanged = 0;
    let skipped = 0;
    let tickets = 0;
    let factCount = 0;
    for (const relation of relations) {
      const current = parentOf.get(relation.childThreadId);
      // Never override a relation V2 already carries (or link a missing thread). A child an
      // earlier, failed attempt linked to this parent still needs its ticket below.
      if (current === undefined || (current !== null && current !== relation.parentThreadId)) {
        unchanged += 1;
        continue;
      }
      const childThreadId = ThreadId.make(relation.childThreadId);
      const parentThreadId = ThreadId.make(relation.parentThreadId);
      if (current === null) {
        // Only a refusal is skipped; a failed write fails the pass so it is not ledgered.
        const written = yield* lineage
          .setThreadLineage({
            threadId: childThreadId,
            parentThreadId,
            relationshipToParent: relation.relationshipToParent,
          })
          .pipe(
            Effect.map(Option.some),
            Effect.catchIf(
              (error) => error.reason === "refused",
              () => Effect.succeed(Option.none()),
            ),
          );
        if (Option.isNone(written)) {
          skipped += 1;
          continue;
        }
        linked += written.value ? 1 : 0;
      } else {
        unchanged += 1;
      }
      if (relation.ticketId !== null) {
        yield* metadata.upsert({ childThreadId, parentThreadId, ticketId: relation.ticketId });
        tickets += 1;
      }
    }
    const known = (threadId: string) => parentOf.has(threadId);
    for (const threadId of flags.ephemeralThreadIds.filter(known)) {
      yield* facts.upsert(ThreadId.make(threadId), { retention: "ephemeral" });
      factCount += 1;
    }
    for (const row of flags.environments.filter((entry) => known(entry.threadId))) {
      const environment = decodeEnvironment(row.json);
      if (Option.isNone(environment)) continue;
      yield* facts.upsert(ThreadId.make(row.threadId), { environment: environment.value });
      factCount += 1;
    }
    return { linked, unchanged, skipped, tickets, facts: factCount };
  });

  const done = yield* sql<{ readonly step: string }>`
    SELECT step FROM t3team_v2_cutover WHERE step = ${LINEAGE_CUTOVER_STEP}
  `;
  if (done.length > 0) return null;
  const summary: LegacyLineageCutoverSummary = yield* apply;
  const summaryJson = yield* Schema.encodeEffect(SummaryJson)(summary);
  yield* sql`
    INSERT INTO t3team_v2_cutover (step, applied_at, summary_json)
    VALUES (${LINEAGE_CUTOVER_STEP}, ${DateTime.formatIso(yield* DateTime.now)}, ${summaryJson})
    ON CONFLICT (step) DO NOTHING
  `;
  yield* Effect.logInfo("t3team re-linked V1 thread relations on V2 lineage", summary);
  return summary;
}).pipe(
  Effect.catchCause((cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.interrupt
      : Effect.logWarning("t3team V1 lineage cutover failed; it retries on the next start", {
          cause: Cause.pretty(cause),
        }).pipe(Effect.as(null)),
  ),
  Effect.withSpan("t3team.legacyLineageCutover.run"),
);
