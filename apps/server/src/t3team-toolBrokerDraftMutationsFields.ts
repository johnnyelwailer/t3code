import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import {
  type DraftToolContext,
  readIssueId,
  readTrimmedString,
} from "./t3team-toolBrokerDraftMutationInputs.ts";
import { makeDraft, type DraftField } from "./t3team-toolBrokerDraftMutationMake.ts";

/** Trimmed, de-duplicated names; `undefined` when the value is present but not a string array. */
function readNames(args: Record<string, unknown>, key: string): ReadonlyArray<string> | undefined {
  const value = args[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return [...new Set(value.map((item: string) => item.trim()).filter((item) => item.length > 0))];
}

/** Shared by labels and fix versions: `add` / `remove` name lists, idempotent on Jira. */
function addRemoveDraft(
  field: Extract<DraftField, "labels" | "fix_version">,
  tool: string,
  args: Record<string, unknown>,
  context: DraftToolContext,
) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const add = readNames(args, "add");
  const remove = readNames(args, "remove");
  if (add === undefined || remove === undefined) {
    return errorResult(`${tool}: add and remove must be arrays of strings.`);
  }
  if (add.length === 0 && remove.length === 0) {
    return errorResult(`${tool} requires at least one name in add or remove.`);
  }
  const overlap = add.filter((name) => remove.includes(name));
  if (overlap.length > 0) {
    return errorResult(`${tool}: cannot add and remove ${overlap.join(", ")}.`);
  }
  const spaced = field === "labels" ? [...add, ...remove].filter((name) => /\s/.test(name)) : [];
  if (spaced.length > 0) {
    return errorResult(`${tool}: Jira labels cannot contain spaces (${spaced.join(", ")}).`);
  }
  const noun = field === "labels" ? "labels" : "fix versions";
  return makeDraft({
    tool,
    issueIdOrKey,
    field,
    patch: { add, remove },
    summary: `Drafted ${noun} change for ${issueIdOrKey}.`,
  });
}

export const labelsDraft = (tool: string, args: Record<string, unknown>, ctx: DraftToolContext) =>
  addRemoveDraft("labels", tool, args, ctx);

export const fixVersionDraft = (
  tool: string,
  args: Record<string, unknown>,
  ctx: DraftToolContext,
) => addRemoveDraft("fix_version", tool, args, ctx);

export function priorityDraft(tool: string, args: Record<string, unknown>, ctx: DraftToolContext) {
  const issueIdOrKey = readIssueId(args, ctx);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const priority = readTrimmedString(args.priority);
  if (!priority) return errorResult(`${tool} requires priority (a priority name, e.g. High).`);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "priority",
    patch: { priority },
    summary: `Drafted priority ${priority} for ${issueIdOrKey}.`,
  });
}
