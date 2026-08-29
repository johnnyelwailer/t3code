/**
 * The composer's model call, and the guarantee that it cannot eat the report.
 *
 * Split from `t3team-workflowReportCompose.ts` (LOC ceiling) along a real seam: this module is
 * "ask the utility model, and survive every way that can go wrong"; the other is "make the answer
 * replay-deterministic". Nothing here touches the journal, so the fallback path is testable
 * without a store.
 *
 * "A prettifier that can lose the payload is worse than no prettifier" (Epic 25 §Auto-report on
 * completion). The exported function therefore has NO failure mode: no model configured, a driver
 * error, an overrun, output that does not decode, a decoded report with an empty verdict — all
 * five return the structural fallback over the same facts, tagged `origin: "fallback"` with the
 * reason recorded.
 *
 * @module t3team-workflowReportComposeModel
 */
import type { ModelSelection } from "@t3tools/contracts";
import type { JournalStore } from "@t3team/sdk";
import * as Schema from "effect/Schema";

import { renderWorkflowReportFallback } from "./t3team-workflowReportFallback.ts";
import {
  buildWorkflowReportPrompt,
  WORKFLOW_REPORT_COMPOSER_INSTRUCTIONS,
} from "./t3team-workflowReportPrompt.ts";
import {
  WorkflowRunReport,
  type WorkflowRunReportFacts,
  type WorkflowRunReportRecord,
} from "./t3team-workflowReportTypes.ts";

/** Wall-clock ceiling for one composition. Generous: the composer decides its own length, and a
 * long report is a legitimate reason to take a while. The fallback covers the overrun. */
export const WORKFLOW_REPORT_TIMEOUT_MS = 120_000;

/**
 * The utility-model call, injected. Shaped like the `generateRepairStructured` port on
 * `LaunchWorkflowRecipeInput` (`t3team-workflowEngineLaunchTypes.ts:80`), for the same reason: the
 * engine-side modules stay free of Effect services and the live wiring resolves `TextGeneration`
 * once, at the edge (`t3team-workflowReportComposerLive.ts`).
 */
export type GenerateWorkflowReport = (input: {
  readonly prompt: string;
  readonly instructions: string;
  readonly modelSelection: ModelSelection;
}) => Promise<unknown>;

export interface ComposeWorkflowRunReportInput {
  readonly facts: WorkflowRunReportFacts;
  /** The run's journal store — the same one the engine drove the run through. */
  readonly store: JournalStore;
  /** Absent (no utility-model driver, or none configured) composes nothing and falls back. */
  readonly generate?: GenerateWorkflowReport | undefined;
  /** The utility model this run's report is composed with. Required alongside `generate`. */
  readonly modelSelection?: ModelSelection | undefined;
  readonly nowIso: () => string;
  readonly timeoutMs?: number | undefined;
}

// Hoisted: keep the compiled decoder at module scope (no-inline-schema-compile).
const decodeReport = Schema.decodeUnknownSync(WorkflowRunReport);

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Report composer timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
  });
  return Promise.race([work, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Reject a report that decodes but says nothing — an empty verdict is junk, not a judgement. */
function assertUsableReport(report: WorkflowRunReport): WorkflowRunReport {
  if (report.verdict.trim().length === 0) {
    throw new Error("Report composer returned an empty verdict.");
  }
  return report;
}

/** Compose this run's report, or render its facts structurally. Never throws. No journal. */
export async function composeFreshWorkflowRunReport(
  input: ComposeWorkflowRunReportInput,
): Promise<WorkflowRunReportRecord> {
  const composedAt = input.nowIso();
  const fallback = (fallbackReason: string): WorkflowRunReportRecord => ({
    report: renderWorkflowReportFallback(input.facts),
    origin: "fallback",
    fallbackReason,
    composedAt,
  });

  if (input.generate === undefined || input.modelSelection === undefined) {
    return fallback("No utility model is configured for report composition.");
  }
  try {
    const generated = await withTimeout(
      input.generate({
        prompt: buildWorkflowReportPrompt(input.facts),
        instructions: WORKFLOW_REPORT_COMPOSER_INSTRUCTIONS,
        modelSelection: input.modelSelection,
      }),
      input.timeoutMs ?? WORKFLOW_REPORT_TIMEOUT_MS,
    );
    return {
      report: assertUsableReport(decodeReport(generated)),
      origin: "composed",
      composedAt,
    };
  } catch (cause) {
    return fallback(cause instanceof Error ? cause.message : String(cause));
  }
}
