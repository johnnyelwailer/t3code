/**
 * The attribution a workflow stamps on the prompt it posts to drive an `askAgent` turn.
 *
 * That message is `role: "user"` because that is how a provider receives turn input, so without an
 * author a client cannot tell nine paragraphs of machine-authored instructions from something the
 * person typed — and it rendered them in the user's own styling. The `workflow` author variant is
 * that signal (`packages/contracts/src/t3team-message-author.ts`), and it carries the summary line
 * a collapsed row needs so the client needs no second stream to render one.
 *
 * The label is derived with the SAME helper and the SAME `label ?? prompt` precedence the live step
 * strip uses (`t3team-workflowEngineStepActivities.ts`), so the collapsed prompt and its step row
 * read identically instead of drifting into two names for one step.
 */

import type { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";

import { workflowStepDetailSnippet } from "./t3team-workflowEngineStepActivities.ts";

/** Used only when a body supplies neither a label nor any prompt text: the variant's `label` is
 * REQUIRED, and an empty string would fail schema decode on a message that is otherwise fine. */
const FALLBACK_LABEL = "Workflow instructions";

export function workflowTurnAuthor(
  workflowRunId: string,
  /** The ask's correlationId — also the id its live step activity is keyed by. */
  stepId: string,
  step: { readonly label?: string; readonly prompt: string },
): T3TeamMessageWorkflowAuthor {
  const label = workflowStepDetailSnippet(step.label ?? step.prompt);
  return {
    kind: "workflow",
    workflowRunId,
    stepId,
    label: label.length > 0 ? label : FALLBACK_LABEL,
  };
}
