import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import {
  type DraftToolContext,
  readIssueId,
  readTrimmedString,
} from "./t3team-toolBrokerDraftMutationInputs.ts";
import { makeDraft } from "./t3team-toolBrokerDraftMutationMake.ts";

/** Split out of `t3team-toolBrokerDraftMutations.ts` to stay under the 200-line additive cap. */
export function linkDraft(tool: string, args: Record<string, unknown>, context: DraftToolContext) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const otherIssueIdOrKey = readTrimmedString(args.other_issue_id);
  if (!otherIssueIdOrKey) return errorResult(`${tool} requires other_issue_id.`);
  const linkTypeName = readTrimmedString(args.link_type_name);
  if (!linkTypeName) return errorResult(`${tool} requires link_type_name.`);
  const direction =
    args.direction === "inward" ? "inward" : args.direction === "outward" ? "outward" : undefined;
  if (!direction) return errorResult(`${tool} requires direction ("inward" or "outward").`);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "link",
    patch: { action: "create", otherIssueIdOrKey, linkTypeName, direction },
    summary: `Drafted linking ${issueIdOrKey} to ${otherIssueIdOrKey} (${linkTypeName}).`,
  });
}

export function linkRemoveDraft(
  tool: string,
  args: Record<string, unknown>,
  context: DraftToolContext,
) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const linkId = readTrimmedString(args.link_id);
  if (!linkId) return errorResult(`${tool} requires link_id.`);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "link",
    patch: { action: "remove", linkId },
    summary: `Drafted removing a link from ${issueIdOrKey}.`,
  });
}
