/**
 * The report composer's instructions, and the facts it composes from.
 *
 * The instructions are NOT a second set of rules. `T3TEAM_REPORTING_MANUAL`
 * (`t3team-workflowManualReporting.ts`) is the contract this repo already publishes for whoever
 * writes a run's report — surfaced to authoring agents as `t3team_help("reporting")`. The composer
 * is simply the specialist that contract was written for, so it is quoted verbatim and then
 * re-addressed by a short preamble. Writing a divergent set here is how the two would drift, and
 * the manual is the one PJ actually reviewed.
 *
 * Two adaptations the preamble has to make, and only two:
 *   • the manual's §1 mechanism is `getThread().showWidget(...)`; the composer has no thread, so
 *     "a visual is the default medium" becomes "structure the markdown — tables, headed sections
 *     — a prose wall is the failure mode either way";
 *   • the manual's §2 is about returning a value rather than narrating; the composer's whole
 *     output IS a value, so §2 becomes the output contract.
 * Everything else — lead with the verdict, numbers in a table, never forward a sub-agent's output
 * verbatim, uncertainty is first-class — applies unchanged.
 *
 * There is deliberately NO length instruction beyond the manual's own §5. "reporter decides how
 * long it must be.. as long as necessary" (PJ, 2026-08-29).
 *
 * @module t3team-workflowReportPrompt
 */
import { T3TEAM_REPORTING_MANUAL } from "./t3team-workflowManualReporting.ts";
import {
  renderWorkflowReportOutput,
  renderWorkflowReportSteps,
} from "./t3team-workflowReportFallback.ts";
import type { WorkflowRunReportFacts } from "./t3team-workflowReportTypes.ts";

const COMPOSER_PREAMBLE = `You are the REPORTER for an automated orchestration run. You did not run it,
and the person reading you did not watch it. You have the run's recorded facts below; compose the
report that person should read.

Two adjustments to the contract that follows, because you write a value rather than a chat message:

- Its rule 1 says to RENDER structure rather than describe it, using a widget. You have no widget:
  your \`body\` is markdown. The rule still holds — build the table, use headed sections. A wall of
  prose is the failure this contract exists to prevent, in either medium.
- Its rule 2 says to return a structured result rather than narrate. Your entire output is that
  structured result; the fields are specified below.

Everything else in the contract applies to you unchanged.

Then decide WHO resolves what you found:

- \`"agent"\` — the run's own agent can act on this now: the findings are diagnosed, the work is
  small and bounded, and it needs no decision a human owns. Routing here starts an agent turn, so
  only choose it when there is something specific to do.
- \`"user"\` — a person must decide, approve, supply something, or simply be told. Choose this when
  the outcome is uncertain, the fix is not obvious, or the run succeeded and nothing is owed.

State the reason in one sentence, in \`recipientReason\`.

Judge the OUTCOME, not just the status. A run can finish green and still miss what it was asked
for; say so plainly in the verdict when it does. If no expected outcome was recorded, say that the
outcome could not be judged rather than implying it was met.

Output fields:
- \`verdict\`: one line. The outcome and its consequence. It may be the only line read.
- \`body\`: the report, as markdown. You decide its length — as long as necessary, no longer.
- \`recipient\`: "agent" or "user".
- \`recipientReason\`: one sentence.
`;

/** The composer's full instructions: the preamble plus the repo's own reporting contract. */
export const WORKFLOW_REPORT_COMPOSER_INSTRUCTIONS = `${COMPOSER_PREAMBLE}
--- THE REPORTING CONTRACT ---

${T3TEAM_REPORTING_MANUAL}`;

function renderIntent(facts: WorkflowRunReportFacts): string {
  if (facts.intent == null) {
    return "WHAT IT WAS ASKED TO DO\nNot recorded for this run. You cannot judge the outcome against an expected outcome; say so.";
  }
  return [
    "WHAT IT WAS ASKED TO DO",
    `Goal: ${facts.intent.goal}`,
    `Expected outcome: ${facts.intent.expectedOutcome}`,
    `Guardrails: ${facts.intent.guardrails.length === 0 ? "(none)" : facts.intent.guardrails.join(" | ")}`,
  ].join("\n");
}

function renderTranscripts(facts: WorkflowRunReportFacts): string {
  const transcripts = facts.transcripts ?? [];
  if (transcripts.length === 0) return "";
  const blocks = transcripts.map((transcript) =>
    [
      `--- child thread ${transcript.threadId}${transcript.label === undefined ? "" : ` (${transcript.label})`} ---`,
      transcript.text,
    ].join("\n"),
  );
  return [
    "CHILD THREAD TRANSCRIPTS",
    "Source material. Summarise ACROSS them into one report; never forward any of this text as-is.",
    ...blocks,
  ].join("\n");
}

/** Render the run's facts as the composer's prompt. Structural, never a narration. */
export function buildWorkflowReportPrompt(facts: WorkflowRunReportFacts): string {
  const steps = renderWorkflowReportSteps(facts);
  const output = renderWorkflowReportOutput(facts.output);
  return [
    `RUN ${facts.runId}`,
    `Final status: ${facts.status}`,
    ...(facts.failureReason == null || facts.failureReason.length === 0
      ? []
      : [`Failure reason: ${facts.failureReason}`]),
    ...(facts.failureStep == null || facts.failureStep.length === 0
      ? []
      : [`Failed at: ${facts.failureStep}`]),
    "",
    renderIntent(facts),
    "",
    steps.length === 0 ? "STEPS\n(none recorded)" : `STEPS\n${steps}`,
    "",
    output.length === 0 ? "RUN RESULT\n(the run returned nothing)" : `RUN RESULT\n${output}`,
    "",
    renderTranscripts(facts),
  ]
    .join("\n")
    .trimEnd();
}
