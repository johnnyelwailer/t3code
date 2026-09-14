/**
 * The auto-report's journal slot — what makes the report REPLAYED rather than re-composed.
 *
 * PJ, 2026-08-29: *"the report is just like a specialized form of an agent() call. it's also
 * replayed"*. A composed report is model output: compose twice and you get two different texts for
 * one run, which is the definition of a non-deterministic replay. So the composition is recorded
 * in the run's own journal, through the run's own {@link JournalStore}, and every later drive of
 * that run reads the recording instead of asking a model again.
 *
 * ── Why seq 0, and why that is safe ─────────────────────────────────────────
 * The report is composed AFTER the body returns, so it has no place in the body's primitive
 * sequence. It gets a reserved slot beside it:
 *
 *   • The body's counter is `takeSeq: () => (seq += 1)` (`@runbook/core/durableRuntime`), so the
 *     FIRST body primitive is seq 1 and **seq 0 is a position no body can ever occupy**. Replay
 *     only ever looks up `journal.get(currentSeq)` for `currentSeq >= 1`, so this entry is never
 *     fetched, never compared by `assertJournalMatch`, and cannot raise a drift error — including
 *     under `workflowVersionPolicy: "allow-change"`, where an edited body legitimately emits a
 *     different NUMBER of primitives. A slot at `maxSeq + 1` would collide in exactly that case.
 *   • `maxRecordedSeq` is `journal.size === 0 ? 0 : Math.max(...keys)`. Adding a seq-0 entry to an
 *     otherwise empty journal yields `0` — bit-for-bit the value the empty-journal branch already
 *     produces — so the gap-drift check (`currentSeq <= maxRecordedSeq`) behaves identically with
 *     or without this entry. A negative sentinel would not have that property.
 *   • On the SQLite backend the primary key is `(run_id, seq, phase)`. This row is
 *     `(run_id, 0, 'call')`: run metadata is `(run_id, -1, 'meta')`, body entries are seq >= 1,
 *     and a `resolved` reply carries phase `'resolved'`. Nothing else can claim the key.
 *
 * Two visible side effects, both accounted for. `inspectRun().entryCount` — a diagnostic counter —
 * now includes the report; `lastSeq` is unaffected (0 is not greater than 0). And `startWorkflow`
 * refuses a runId whose journal is non-empty, so a run whose body journaled NOTHING can no longer
 * be `startWorkflow`-ed a second time under the same id once it has a report. Hosts resume rather
 * than re-start (run ids are per-launch), and refusing is arguably the right answer there anyway —
 * that run already reported an outcome.
 *
 * ── Where the composer step belongs in the terminal ordering ────────────────
 * See {@link composeWorkflowRunReport} in `t3team-workflowReportCompose.ts` — the rationale is at
 * that call, where a reader who is about to move it will actually be standing.
 *
 * @module t3team-workflowReportJournal
 */
import { hashArgs, type JournalEntry, type JournalStore } from "@t3team/sdk";
import * as Schema from "effect/Schema";

import { WorkflowRunReportRecord } from "./t3team-workflowReportTypes.ts";

/** The reserved journal position for a run's report. See the module header for why 0 is safe. */
export const WORKFLOW_REPORT_JOURNAL_SEQ = 0;

/** The journal `kind` for the report entry. `PrimitiveKind` is an open vocabulary by design
 * (`@runbook/core/primitiveKinds`: "adapters ... may add their own primitive identifiers"). */
export const WORKFLOW_REPORT_JOURNAL_KIND = "workflow.report";

// Hoisted: keep the compiled decoder at module scope (no-inline-schema-compile).
const decodeReportRecord = Schema.decodeUnknownSync(WorkflowRunReportRecord);

/**
 * The report already recorded for this run, or `undefined` if there is none.
 *
 * An entry that no longer decodes is treated as absent rather than fatal: a run whose report
 * cannot be read must still be able to produce one, and the alternative — throwing — would turn a
 * stale record into a run-level failure long after the run itself succeeded.
 */
export async function readJournaledWorkflowReport(
  store: JournalStore,
  runId: string,
): Promise<WorkflowRunReportRecord | undefined> {
  const entries = await store.readEntries(runId);
  const entry = entries.bySeq.get(WORKFLOW_REPORT_JOURNAL_SEQ);
  if (entry === undefined || entry.kind !== WORKFLOW_REPORT_JOURNAL_KIND) return undefined;
  try {
    return decodeReportRecord(entry.result);
  } catch {
    return undefined;
  }
}

/**
 * Record the run's report at its reserved slot, durably.
 *
 * Awaited by the caller BEFORE the report is delivered anywhere, so no reader can ever see a
 * report that a restart would then re-compose differently. Both backends resolve a repeat write
 * at the same key as last-write-wins (`bySeq.set` on the fs reader, `INSERT OR REPLACE` on
 * SQLite), which is why the compose-once guarantee is the caller's read-before-write, not this.
 */
export async function appendWorkflowReportToJournal(
  store: JournalStore,
  runId: string,
  record: WorkflowRunReportRecord,
): Promise<void> {
  const entry: JournalEntry = {
    seq: WORKFLOW_REPORT_JOURNAL_SEQ,
    callId: `${WORKFLOW_REPORT_JOURNAL_SEQ}:${WORKFLOW_REPORT_JOURNAL_KIND}:${runId}`,
    kind: WORKFLOW_REPORT_JOURNAL_KIND,
    refId: WORKFLOW_REPORT_JOURNAL_KIND,
    // Recorded, never compared — nothing replays THROUGH this entry, so there is no drift check
    // to feed. It identifies which run's outcome was reported, for a human reading the journal.
    argsHash: hashArgs({ runId }),
    result: record,
    startedAt: record.composedAt,
    endedAt: record.composedAt,
  };
  await store.appendEntry(runId, entry);
}
