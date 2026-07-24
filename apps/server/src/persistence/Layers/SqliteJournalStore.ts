/**
 * SqliteJournalStore — the SDK {@link JournalStore} seam, backed by the `workflow_journal`
 * table (Epic 25 §Open question 2).
 *
 * Each journal entry is stored as one row holding the *exact* wire object the fs backend
 * writes as a line (`toWire` / `toResolvedWire`), so {@link buildJournalMaps} reconstructs the
 * identical replay maps the engine expects — every 25.2/25.4 semantic (the void/value
 * envelope, schema re-validation on replay, drift detection, the `sent`/`resolved` split)
 * rides along unchanged. One row per entry means a torn tail is impossible (N/A), so there is
 * no torn-tail recovery here. Run metadata is the `phase='meta'` row at seq -1.
 *
 * The SDK engine is Promise-based, so this bridges Effect → Promise: `sql` is captured once
 * (its statements are `R = never`), and each method runs via `Effect.runPromise`. The
 * `createStoreSink` adapter in the SDK sequences a run's appends on a single tail promise and
 * awaits a `flush()` barrier at the suspend/complete boundary, so rows are durable before the
 * host parks or completes a run.
 */

import {
  buildJournalMaps,
  type JournalEntry,
  type JournalMaps,
  type JournalStore,
  type ResolvedWireInput,
  type RunMeta,
  toResolvedWire,
  toWire,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { WorkflowJournalStore } from "../Services/WorkflowJournalStore.ts";

interface EntryJsonRow {
  readonly entryJson: string;
}
interface SeqRow {
  readonly seq: number;
}

/** Parse the seq out of a `"<runId>:<seq>"` correlationId (the SDK's documented scheme). */
function seqFromCorrelationId(correlationId: string): number {
  const parsed = Number(correlationId.slice(correlationId.lastIndexOf(":") + 1));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Build the Promise-based {@link JournalStore} over a resolved `sql` client. A plain function
 * (not an `Effect.gen`) so its `Effect.runPromise` calls — which fire later, when the SDK
 * engine drives the store outside any fiber — are not flagged as nested-Effect runs.
 */
export function buildSqliteJournalStore(sql: SqlClient.SqlClient): JournalStore {
  // A `resolved` reply reuses its matching `sent` entry's seq so the (run_id, seq, phase) PK
  // stays unique. Prefer the recorded sent row; fall back to parsing the correlationId.
  const resolvedSeq = async (runId: string, correlationId: string): Promise<number> => {
    const rows = await Effect.runPromise(
      sql<SeqRow>`SELECT seq FROM workflow_journal WHERE run_id = ${runId} AND correlation_id = ${correlationId} AND phase = 'sent' LIMIT 1`,
    );
    return rows.length > 0 ? Number(rows[0]!.seq) : seqFromCorrelationId(correlationId);
  };

  return {
    appendEntry: (runId, entry: JournalEntry) =>
      Effect.runPromise(
        sql`
          INSERT OR REPLACE INTO workflow_journal (run_id, seq, phase, correlation_id, entry_json)
          VALUES (
            ${runId},
            ${entry.seq},
            ${entry.phase === "sent" ? "sent" : "call"},
            ${entry.correlationId ?? null},
            ${JSON.stringify(toWire(entry))}
          )
        `,
      ).then(() => undefined),

    appendResolved: async (runId, resolved: ResolvedWireInput) => {
      const seq = await resolvedSeq(runId, resolved.correlationId);
      // First-write-wins (a dismissal/earlier reply already at this key stays): OR IGNORE.
      await Effect.runPromise(
        sql`
          INSERT OR IGNORE INTO workflow_journal (run_id, seq, phase, correlation_id, entry_json)
          VALUES (
            ${runId},
            ${seq},
            'resolved',
            ${resolved.correlationId},
            ${JSON.stringify(toResolvedWire(resolved))}
          )
        `,
      );
    },

    readEntries: (runId): Promise<JournalMaps> =>
      Effect.runPromise(
        sql<EntryJsonRow>`
          SELECT entry_json AS "entryJson"
          FROM workflow_journal
          WHERE run_id = ${runId} AND phase != 'meta'
          ORDER BY seq ASC, phase ASC
        `,
      ).then((rows) => buildJournalMaps(rows.map((row) => JSON.parse(row.entryJson) as unknown))),

    readRunMeta: (runId): Promise<RunMeta | undefined> =>
      Effect.runPromise(
        sql<EntryJsonRow>`SELECT entry_json AS "entryJson" FROM workflow_journal WHERE run_id = ${runId} AND phase = 'meta' LIMIT 1`,
      ).then((rows) =>
        rows.length === 0 ? undefined : (JSON.parse(rows[0]!.entryJson) as RunMeta),
      ),

    writeRunMeta: (runId, meta) =>
      Effect.runPromise(
        sql`
          INSERT OR REPLACE INTO workflow_journal (run_id, seq, phase, correlation_id, entry_json)
          VALUES (${runId}, -1, 'meta', NULL, ${JSON.stringify(meta)})
        `,
      ).then(() => undefined),

    hasRun: (runId) =>
      Effect.runPromise(
        sql`SELECT 1 AS "one" FROM workflow_journal WHERE run_id = ${runId} LIMIT 1`,
      ).then((rows) => rows.length > 0),

    clear: (runId) =>
      Effect.runPromise(sql`DELETE FROM workflow_journal WHERE run_id = ${runId}`).then(
        () => undefined,
      ),

    locator: (runId) => `sqlite:workflow_journal/${runId}`,
  };
}

export const makeSqliteJournalStore: Effect.Effect<JournalStore, never, SqlClient.SqlClient> =
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return buildSqliteJournalStore(sql);
  });

export const WorkflowJournalStoreLive = Layer.effect(WorkflowJournalStore, makeSqliteJournalStore);
