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
  selectReplayWindow,
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
interface CandidateRow {
  readonly seq: number;
  readonly entryJson: string;
}
interface CountRow {
  readonly n: number;
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

    /**
     * Checkpoint-aware replay window (bounded execution, phase 2). Returns the entries a resume
     * actually needs — the suffix strictly after the latest VALID checkpoint, the FULL correlation
     * map (at-least-once delivery), and the lifetime totals — instead of materializing the whole
     * journal. It feeds the rows to the shared {@link selectReplayWindow} so the selection rule is
     * identical to the filesystem reference; only the *materialization cost* is backend-specific.
     *
     * Bounded, deterministic, no live-clock reads. `json_extract` keeps the checkpoint scan
     * O(checkpoints); the suffix/prefix/correlation reads touch only the rows a resume needs.
     */
    readReplayWindow: async (runId) => {
      // Latest VALID checkpoint (the same rule selectReplayWindow applies over the checkpoint rows
      // below, so it can never diverge from the reference projection).
      const checkpointRows = await Effect.runPromise(
        sql<CandidateRow>`
          SELECT seq AS "seq", entry_json AS "entryJson"
          FROM workflow_journal
          WHERE run_id = ${runId}
            AND phase = 'call'
            AND json_extract(entry_json, '$.kind') = 'checkpoint'
            AND json_extract(entry_json, '$.refId') = 'checkpoint'
          ORDER BY seq DESC
        `,
      );
      const boundarySeq = selectReplayWindow(
        buildJournalMaps(checkpointRows.map((row) => JSON.parse(row.entryJson) as unknown)),
      ).checkpoint?.seq;

      // Bounded materialization: the bySeq suffix strictly after the boundary (or the whole journal
      // when no valid checkpoint exists — a pre-checkpoint run stays a full-replay run), the FULL
      // `resolved` correlation map, and the prefix `sent` rows used only for unsettled-ask
      // detection (they are not part of the returned bySeq).
      const suffixRows =
        boundarySeq === undefined
          ? await Effect.runPromise(
              sql<EntryJsonRow>`
                SELECT entry_json AS "entryJson"
                FROM workflow_journal
                WHERE run_id = ${runId} AND phase IN ('call', 'sent')
                ORDER BY seq ASC, phase ASC
              `,
            )
          : await Effect.runPromise(
              sql<EntryJsonRow>`
                SELECT entry_json AS "entryJson"
                FROM workflow_journal
                WHERE run_id = ${runId} AND phase IN ('call', 'sent') AND seq > ${boundarySeq}
                ORDER BY seq ASC, phase ASC
              `,
            );
      const prefixSentRows =
        boundarySeq === undefined
          ? []
          : await Effect.runPromise(
              sql<EntryJsonRow>`
                SELECT entry_json AS "entryJson"
                FROM workflow_journal
                WHERE run_id = ${runId} AND phase = 'sent' AND seq < ${boundarySeq}
                ORDER BY seq ASC
              `,
            );
      const resolvedRows = await Effect.runPromise(
        sql<EntryJsonRow>`
          SELECT entry_json AS "entryJson"
          FROM workflow_journal
          WHERE run_id = ${runId} AND phase = 'resolved'
        `,
      );
      const totalRow = await Effect.runPromise(
        sql<CountRow>`
          SELECT COUNT(*) AS "n"
          FROM workflow_journal
          WHERE run_id = ${runId} AND phase IN ('call', 'sent')
        `,
      );
      const totalEntries = Number(totalRow[0]?.n ?? 0);

      // selectReplayWindow strips the prefix from the returned bySeq, so the materialized window
      // stays O(checkpoint suffix + pending work) while the selection rule stays the reference's.
      const partial = buildJournalMaps([
        ...checkpointRows.map((row) => JSON.parse(row.entryJson) as unknown),
        ...suffixRows.map((row) => JSON.parse(row.entryJson) as unknown),
        ...prefixSentRows.map((row) => JSON.parse(row.entryJson) as unknown),
      ]);
      const byCorrelation = buildJournalMaps(
        resolvedRows.map((row) => JSON.parse(row.entryJson) as unknown),
      ).byCorrelation;
      const window = selectReplayWindow({ bySeq: partial.bySeq, byCorrelation });
      return { ...window, totalEntries };
    },

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
