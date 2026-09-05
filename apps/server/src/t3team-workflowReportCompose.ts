/**
 * The report composer seam: one run's facts in, one structured report out — exactly once.
 *
 * The composer is an ISOLATED turn — its own instructions, its own utility model, no thread, no
 * tools, no access to the launching agent's context. It is not the workflow body and not the agent
 * that launched it; it only reads what the run recorded (Epic 25 §Auto-report on completion, and
 * Epic 24's T2b composer subagent, whose model seam this reuses).
 *
 * This module owns the REPLAY DETERMINISM half. The composition is journaled at a reserved slot
 * (`t3team-workflowReportJournal.ts`), read before anything else happens, and returned verbatim on
 * every later drive of the run — so a fresh run composes once and a replayed run re-renders.
 * The "the composer cannot eat the report" half lives in `t3team-workflowReportComposeModel.ts`;
 * its contract is that `composeFreshWorkflowRunReport` has no failure mode, which is what lets
 * this function have none either.
 *
 * @module t3team-workflowReportCompose
 */
import {
  appendWorkflowReportToJournal,
  readJournaledWorkflowReport,
} from "./t3team-workflowReportJournal.ts";
import { composeFreshWorkflowRunReport } from "./t3team-workflowReportComposeModel.ts";
import type { ComposeWorkflowRunReportInput } from "./t3team-workflowReportComposeModel.ts";
import type { WorkflowRunReportRecord } from "./t3team-workflowReportTypes.ts";

// The model call and its fallback live in the sibling module (LOC ceiling); re-exported so
// importers reach the whole seam through this one module.
export {
  composeFreshWorkflowRunReport,
  WORKFLOW_REPORT_TIMEOUT_MS,
} from "./t3team-workflowReportComposeModel.ts";
export type {
  ComposeWorkflowRunReportInput,
  GenerateWorkflowReport,
} from "./t3team-workflowReportComposeModel.ts";

/**
 * Compose (or replay) this run's report. Never throws, and never returns nothing.
 *
 * ── WHERE THIS BELONGS IN THE TERMINAL ORDERING ─────────────────────────────
 * Call this BEFORE the run's terminal transition side effects — before
 * `lifecycle.recordCompleted()` / `recordFailed()`, before the terminal step activity, and before
 * `deliverWorkflowCompletion` — i.e. exactly where a final `agent()` call inside the body would
 * have sat. *"the report is just like a specialized form of an agent() call. it's also replayed"*
 * (PJ, 2026-08-29). That position is forced, not aesthetic:
 *
 *   • A crash after composing but before the terminal transition leaves the report DURABLE in the
 *     journal and the run non-terminal, so a later drive replays the same text. The reverse order
 *     has no such recovery: a crash after the row flips to `completed` and before composing loses
 *     the report permanently, because nothing re-drives a terminal run.
 *   • A crash after composing but before the journal append is indistinguishable from never having
 *     composed — nothing was delivered either — so a later drive composes fresh. There is no
 *     window in which a delivered report and a journaled report can disagree.
 *   • The read-before-write below is what makes it compose exactly once. Both journal backends
 *     resolve a repeat write at the same key as last-write-wins (`bySeq.set` on the fs reader,
 *     `INSERT OR REPLACE` on SQLite), so idempotence has to live here rather than in the store.
 *
 * The cost is that the run row stays `running` for the length of the composition. That is not a
 * new hazard class: it is the identical window every in-body primitive already opens — the engine
 * re-affirms `running` through `beforePrimitive` and a crash mid-primitive already parks the row
 * there — which is the same statement as the one above, that this is a primitive-shaped step which
 * happens to fire after the body returned.
 *
 * NOT wired into `t3team-workflowEngineController.ts`'s `settle` here: the completion trigger and
 * the routing are stage 2 (this stage is the foundation). The paragraph above is the constraint
 * that wiring has to respect.
 */
export async function composeWorkflowRunReport(
  input: ComposeWorkflowRunReportInput,
): Promise<WorkflowRunReportRecord> {
  const journaled = await readJournaledWorkflowReport(input.store, input.facts.runId).catch(
    () => undefined,
  );
  // Replay: return the recorded composition byte-for-byte. No model call, no new timestamp.
  if (journaled !== undefined) return journaled;

  const record = await composeFreshWorkflowRunReport(input);
  // Durable before the caller can deliver it: awaited, so a reader never sees a report a restart
  // would re-compose differently. A store that cannot record it must not lose the report either —
  // the composition still returns, it is simply not replay-stable.
  await appendWorkflowReportToJournal(input.store, input.facts.runId, record).catch(() => {});
  return record;
}
