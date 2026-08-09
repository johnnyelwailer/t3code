/**
 * When a run's completion message should carry a navigable card instead of only prose.
 *
 * PJ's ask: after a rewrite run finishes, the chat should show a small card with a preview that
 * NAVIGATES to the proposal, not a sentence telling the reader to go find it. The card needs
 * structure; this decides when a run has earned one and what goes on it.
 *
 * ── The rule, and why it is not recipe-specific ──────────────────────────────
 * A body OPTS IN by returning `proposed: true` plus the `issueIdOrKey` it proposed against. That is
 * output the author already writes for the human-readable summary, it reads as a sentence
 * ("proposed, on this item"), and any future recipe that proposes a draft gets the card for free by
 * returning the same two fields. The alternative — keying on the recipe id, or on the presence of a
 * draft tool call — would either hard-code `describe-rewrite` into the engine or make the engine
 * inspect a tool result it deliberately does not see.
 *
 * Nothing here fabricates: no `issueIdOrKey`, no card. `summary` and `field` ride along only when
 * the output actually names them, so a body that returns the bare pair still gets a working card.
 */

import type {
  T3TeamDraftMutationField,
  T3TeamMessageWorkItemDraftRefAttachment,
} from "@t3tools/contracts";

const DRAFT_FIELDS: ReadonlySet<string> = new Set([
  "assignee",
  "estimate",
  "status",
  "description",
  "comment",
  "subtask",
  "link",
]);

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

/**
 * The card ref for a completed run's output, or `undefined` when the run proposed nothing.
 *
 * @param projectId The run's project — the card cannot navigate without it.
 */
export function workflowCompletionDraftRef(
  output: unknown,
  projectId: string | undefined,
): T3TeamMessageWorkItemDraftRefAttachment | undefined {
  if (projectId === undefined || projectId.trim().length === 0) return undefined;
  if (output === null || typeof output !== "object" || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  if (record.proposed !== true) return undefined;
  const issueIdOrKey = readString(record, "issueIdOrKey");
  if (issueIdOrKey === undefined) return undefined;
  const field = readString(record, "field");
  const summary = readString(record, "summary");
  return {
    kind: "work-item-draft",
    projectId: projectId.trim(),
    issueIdOrKey,
    ...(field !== undefined && DRAFT_FIELDS.has(field)
      ? { field: field as T3TeamDraftMutationField }
      : {}),
    ...(summary === undefined ? {} : { summary }),
  };
}
