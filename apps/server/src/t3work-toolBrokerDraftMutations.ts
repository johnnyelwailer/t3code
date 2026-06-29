import { errorResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import {
  type DraftToolContext,
  readIssueId,
  readNonNegativeNumber,
  readNullableNumber,
  readNullableString,
  readRecord,
  readTrimmedString,
} from "./t3work-toolBrokerDraftMutationInputs.ts";

const draftToolIds = new Set([
  "t3work.backlog.item.assignee.draft_update",
  "t3work.backlog.item.estimate.draft_update",
  "t3work.backlog.item.subtask.draft_create",
  "t3work.work_item.assignee.draft_update",
  "t3work.work_item.estimate.draft_update",
  "t3work.work_item.status.draft_update",
  "t3work.work_item.description.draft_update",
  "t3work.work_item.comment.draft_create",
]);

type DraftField = "assignee" | "estimate" | "status" | "description" | "comment" | "subtask";

function makeDraft(input: {
  readonly tool: string;
  readonly issueIdOrKey: string;
  readonly field: DraftField;
  readonly patch: Record<string, unknown>;
  readonly summary: string;
}): T3workToolCallResult {
  return okResult({
    ok: true,
    promptText: input.summary,
    draftMutation: {
      kind: "jira-work-item-draft",
      tool: input.tool,
      target: {
        provider: "jira",
        issueIdOrKey: input.issueIdOrKey,
      },
      field: input.field,
      patch: input.patch,
      status: "draft",
      commitPolicy: {
        requiresUserApproval: true,
        commitSurface: "t3work-ui",
      },
    },
  });
}

function assigneeDraft(tool: string, args: Record<string, unknown>, context: DraftToolContext) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const assigneeAccountId = readNullableString(args, "assignee_account_id");
  if (assigneeAccountId === undefined) {
    return errorResult(`${tool} requires assignee_account_id, or null to unassign.`);
  }
  const assigneeDisplayName = readTrimmedString(args.assignee_display_name);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "assignee",
    patch: {
      assigneeAccountId,
      ...(assigneeDisplayName ? { assigneeDisplayName } : {}),
    },
    summary:
      assigneeAccountId === null
        ? `Drafted unassigning ${issueIdOrKey}.`
        : `Drafted assigning ${issueIdOrKey}.`,
  });
}

function estimateDraft(tool: string, args: Record<string, unknown>, context: DraftToolContext) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const estimateValue = readNullableNumber(args, "estimate_value");
  if (estimateValue === undefined) {
    return errorResult(`${tool} requires estimate_value, or null to clear it.`);
  }
  const estimateMode = args.estimate_mode === "hours" ? "hours" : "points";
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "estimate",
    patch: { estimateValue, estimateMode },
    summary: `Drafted ${estimateMode} estimate update for ${issueIdOrKey}.`,
  });
}

function statusDraft(tool: string, args: Record<string, unknown>, context: DraftToolContext) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const targetStatus = readTrimmedString(args.target_status);
  if (!targetStatus) return errorResult(`${tool} requires target_status.`);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "status",
    patch: { targetStatus },
    summary: `Drafted moving ${issueIdOrKey} to ${targetStatus}.`,
  });
}

function textDraft(
  tool: string,
  args: Record<string, unknown>,
  context: DraftToolContext,
  field: "description" | "comment",
) {
  const issueIdOrKey = readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires issue_id.`);
  const body = readTrimmedString(args.body ?? args.text ?? args.markdown);
  if (!body) return errorResult(`${tool} requires body.`);
  return makeDraft({
    tool,
    issueIdOrKey,
    field,
    patch: field === "description" ? { description: body } : { body },
    summary:
      field === "description"
        ? `Drafted description update for ${issueIdOrKey}.`
        : `Drafted comment for ${issueIdOrKey}.`,
  });
}

function subtaskDraft(tool: string, args: Record<string, unknown>, context: DraftToolContext) {
  const issueIdOrKey =
    readTrimmedString(args.parent_issue_id) ??
    readTrimmedString(args.parentIssueIdOrKey) ??
    readIssueId(args, context);
  if (!issueIdOrKey) return errorResult(`${tool} requires parent_issue_id.`);
  const summary = readTrimmedString(args.summary ?? args.title);
  if (!summary) return errorResult(`${tool} requires summary.`);
  const description = readTrimmedString(args.description);
  const estimateHours = readNonNegativeNumber(args.estimate_hours);
  return makeDraft({
    tool,
    issueIdOrKey,
    field: "subtask",
    patch: {
      summary,
      ...(description ? { description } : {}),
      ...(estimateHours !== undefined ? { estimateHours } : {}),
    },
    summary: `Drafted subtask under ${issueIdOrKey}.`,
  });
}

export function isT3workDraftMutationTool(tool: string): boolean {
  return draftToolIds.has(tool);
}

export function callT3workDraftMutationTool(input: {
  readonly tool: string;
  readonly toolArgs: unknown;
  readonly context: DraftToolContext;
}): T3workToolCallResult {
  const args = readRecord(input.toolArgs);
  if (!args) return errorResult(`${input.tool} requires an object input.`);
  if (input.tool.endsWith(".assignee.draft_update")) {
    return assigneeDraft(input.tool, args, input.context);
  }
  if (input.tool.endsWith(".estimate.draft_update")) {
    return estimateDraft(input.tool, args, input.context);
  }
  if (input.tool.endsWith(".status.draft_update")) {
    return statusDraft(input.tool, args, input.context);
  }
  if (input.tool.endsWith(".description.draft_update")) {
    return textDraft(input.tool, args, input.context, "description");
  }
  if (input.tool.endsWith(".comment.draft_create")) {
    return textDraft(input.tool, args, input.context, "comment");
  }
  if (input.tool.endsWith(".subtask.draft_create")) {
    return subtaskDraft(input.tool, args, input.context);
  }
  return errorResult(`Tool '${input.tool}' is not implemented in this runtime.`);
}
