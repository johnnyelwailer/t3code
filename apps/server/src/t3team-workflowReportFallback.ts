/**
 * The report the run gets when the composer cannot produce one.
 *
 * "A prettifier that can lose the payload is worse than no prettifier" (Epic 25 §Auto-report on
 * completion). Every way the composer can fail — an error, a timeout, junk output, no utility
 * model configured at all — lands here, and this function CANNOT fail: it takes the same facts,
 * renders them structurally, and returns the same {@link WorkflowRunReport} shape the composer
 * would have. Callers therefore never have to branch on "was there a report".
 *
 * Rendering reuses `renderWorkflowRecordAsDisplayText` — the engine's existing "a returned object
 * becomes clean labelled lines" renderer, already used by the completion message — rather than a
 * second formatter that would drift from it.
 *
 * The recipient is `"user"` unconditionally here, and that is a deliberate floor rather than a
 * judgement: routing to `agent` starts a turn, and only a composed report has the reasoning behind
 * it to justify one. Degraded output must not spend the agent's time.
 *
 * @module t3team-workflowReportFallback
 */
import { renderWorkflowRecordAsDisplayText } from "@t3tools/shared/t3team-workflowOutputText";

import type { WorkflowRunReport, WorkflowRunReportFacts } from "./t3team-workflowReportTypes.ts";
import { userFacingFailureStep } from "./t3team-workflowFailureReason.ts";

const TERMINAL_VERDICT: Record<string, string> = {
  completed: "Run completed.",
  failed: "Run failed.",
  cancelled: "Run cancelled.",
};

/** One line per step, in emission order — kind, label, phase, and its duration when known. */
export function renderWorkflowReportSteps(facts: WorkflowRunReportFacts): string {
  if (facts.steps.length === 0) return "";
  const rows = facts.steps.map((step) => {
    const label = step.detail ?? step.stepKind;
    const duration = step.durationMs === undefined ? "" : ` (${step.durationMs}ms)`;
    const failure = step.error === undefined ? "" : ` — ${step.error}`;
    return `| ${step.stepKind} | ${label} | ${step.phase}${duration} |${failure}`;
  });
  return ["| Step | What | Outcome |", "| --- | --- | --- |", ...rows].join("\n");
}

/** The run's own returned value as labelled lines, or `""` when it returned nothing readable. */
export function renderWorkflowReportOutput(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output !== "object" || Array.isArray(output)) return String(output);
  return renderWorkflowRecordAsDisplayText(output as Record<string, unknown>, {
    emptyFallback: "",
  });
}

/**
 * Render the run's facts as a report. Never throws, never returns an empty verdict, and never
 * drops a fact the composer would have had: status, failure reason/step, the step table, and the
 * run's own returned value all survive.
 */
export function renderWorkflowReportFallback(facts: WorkflowRunReportFacts): WorkflowRunReport {
  const verdict =
    facts.failureReason != null && facts.failureReason.length > 0
      ? `${TERMINAL_VERDICT[facts.status] ?? `Run ${facts.status}.`} ${facts.failureReason}`
      : (TERMINAL_VERDICT[facts.status] ?? `Run ${facts.status}.`);

  const sections: string[] = [];
  if (facts.intent != null) {
    sections.push(
      [
        "**Asked for**",
        `- Goal: ${facts.intent.goal}`,
        `- Expected outcome: ${facts.intent.expectedOutcome}`,
        ...(facts.intent.guardrails.length === 0
          ? []
          : [`- Guardrails: ${facts.intent.guardrails.join(" | ")}`]),
      ].join("\n"),
    );
  }
  if (facts.failureStep != null && facts.failureStep.length > 0) {
    sections.push(`**Failed at**\n${userFacingFailureStep(facts.failureStep)}`);
  }
  const output = renderWorkflowReportOutput(facts.output);
  if (output.length > 0) sections.push(`**Result**\n${output}`);
  const steps = renderWorkflowReportSteps(facts);
  if (steps.length > 0) sections.push(`**Steps**\n${steps}`);
  sections.push(
    "*(Rendered from the run's recorded facts — the report composer was unavailable.)*",
  );

  return {
    verdict,
    body: sections.join("\n\n"),
    recipient: "user",
    recipientReason:
      "The report composer was unavailable, so no judgement stands behind this report; a human decides what happens next.",
  };
}
