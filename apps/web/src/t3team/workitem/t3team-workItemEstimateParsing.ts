export type WorkItemEstimateParseResult =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: string };

/**
 * Parses the estimate control's free-text draft into the value `updateIssueEstimate` expects.
 *
 * Blank clears the estimate (Jira accepts `null` to remove it); anything else must be a
 * non-negative, finite number. Mirrors the validation `ProjectBacklogRowEstimateCell` already uses,
 * so the two editors agree on what a valid estimate looks like.
 */
export function parseWorkItemEstimateDraft(draft: string): WorkItemEstimateParseResult {
  const trimmed = draft.trim();
  if (!trimmed) return { ok: true, value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: "Estimate must be a non-negative number." };
  }
  return { ok: true, value: parsed };
}
