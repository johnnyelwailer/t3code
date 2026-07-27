/**
 * The kickoff/turn text sent when a human clicks "Rewrite with agent" on a work item's description.
 *
 * Kept as a pure builder, no React, so the wording is directly testable and shared between the
 * "start a turn on the open thread" and "kick off a new thread" paths in
 * `t3team-useWorkItemAgentRewrite.ts` — both need the exact same instruction text.
 *
 * The instruction is deliberately narrow: call the draft tool directly, never write directly, and
 * never author/launch a workflow for it. That last clause exists because "propose the rewrite with
 * the X tool" alone reads to the model as an orchestration request — observed live, the agent wrote
 * a `workflow.ts` and a plan instead of calling the tool, and no draft was ever produced. The agent
 * has no other description-write path (`t3team.work_item.description.draft_update` is the only one),
 * but the prompt says so anyway so a model that already knows a generic "edit this file" or "plan
 * this out" pattern doesn't reach for one.
 */

const DESCRIPTION_DRAFT_TOOL = "t3team.work_item.description.draft_update";

/** Never shown next to the issue key when it would just repeat the key back at the reader — e.g. a
 * loaded-yet fallback title like "Ticket", or a summary that literally IS the key. */
function displayableSummary(summary: string | undefined, issueIdOrKey: string): string | undefined {
  const trimmed = summary?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase() === issueIdOrKey.trim().toLowerCase() ? undefined : trimmed;
}

export function buildWorkItemAgentRewritePrompt(input: {
  readonly issueIdOrKey: string;
  readonly descriptionText?: string | undefined;
  readonly summary?: string | undefined;
}): string {
  const { issueIdOrKey, descriptionText, summary } = input;
  const trimmedDescription = descriptionText?.trim();
  const shownSummary = displayableSummary(summary, issueIdOrKey);

  const lines = [
    `Rewrite the description of ${issueIdOrKey}${shownSummary ? ` (${shownSummary})` : ""}.`,
    "",
    ...(trimmedDescription
      ? ["Current description:", trimmedDescription, ""]
      : ["It has no description yet.", ""]),
    `Call the ${DESCRIPTION_DRAFT_TOOL} tool directly, exactly once, with issue_id "${issueIdOrKey}"` +
      " — do not apply the change yourself, and do not author, launch, or run a workflow or" +
      " orchestration to do this.",
    "A human will review your proposal and accept it before anything is written to Jira.",
  ];

  return lines.join("\n");
}
