/**
 * The kickoff/turn text sent when a human clicks "Rewrite with agent" on a work item's description.
 *
 * Kept as a pure builder, no React, so the wording is directly testable and shared between the
 * "start a turn on the open thread" and "kick off a new thread" paths in
 * `t3team-useWorkItemAgentRewrite.ts` — both need the exact same instruction text.
 *
 * The instruction is deliberately narrow: propose via the draft tool, never write directly. The
 * agent has no other description-write path (`t3team.work_item.description.draft_update` is the
 * only one), but the prompt says so anyway so a model that already knows a generic "edit this file"
 * pattern doesn't reach for one.
 */

const DESCRIPTION_DRAFT_TOOL = "t3team.work_item.description.draft_update";

export function buildWorkItemAgentRewritePrompt(input: {
  readonly issueIdOrKey: string;
  readonly descriptionText?: string | undefined;
  readonly summary?: string | undefined;
}): string {
  const { issueIdOrKey, descriptionText, summary } = input;
  const trimmedDescription = descriptionText?.trim();

  const lines = [
    `Rewrite the description of ${issueIdOrKey}${summary ? ` (${summary})` : ""}.`,
    "",
    ...(trimmedDescription
      ? ["Current description:", trimmedDescription, ""]
      : ["It has no description yet.", ""]),
    `Propose the rewrite with the ${DESCRIPTION_DRAFT_TOOL} tool, issue_id "${issueIdOrKey}" — do not` +
      " apply the change yourself.",
    "A human will review your proposal and accept it before anything is written to Jira.",
  ];

  return lines.join("\n");
}
