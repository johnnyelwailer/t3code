import { okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";

export type DraftField =
  | "assignee"
  | "estimate"
  | "status"
  | "description"
  | "comment"
  | "subtask"
  | "link";

/** Shared by every `*Draft` builder — split out so both the main dispatcher and the link-draft
 * helpers can depend on it without a circular import between them. */
export function makeDraft(input: {
  readonly tool: string;
  readonly issueIdOrKey: string;
  readonly field: DraftField;
  readonly patch: Record<string, unknown>;
  readonly summary: string;
}): T3TeamToolCallResult {
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
      // Carried on the payload (not only in `promptText`) so the draft that reaches the review
      // surface is self-describing without the client re-deriving a human summary.
      summary: input.summary,
      commitPolicy: {
        requiresUserApproval: true,
        commitSurface: "t3team-ui",
      },
    },
  });
}
