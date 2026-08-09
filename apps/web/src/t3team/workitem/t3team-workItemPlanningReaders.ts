import type { WorkItemSprintRef } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  readDisplayName,
  readNumber,
  readRecord,
  readString,
} from "~/t3team/workitem/t3team-workItemFieldReaders";

/**
 * Readers for the two planning fields Jira stores per-site rather than as standard fields: sprint
 * and story points. Both live in `customfield_*` entries whose ids differ between Jira sites, so
 * they are identified structurally instead of by id.
 */

export function readSprintList(value: unknown): ReadonlyArray<WorkItemSprintRef> {
  if (!Array.isArray(value)) return [];

  const sprints: WorkItemSprintRef[] = [];
  for (const entry of value) {
    const name = readDisplayName(entry);
    if (!name) continue;
    const record = readRecord(entry);
    const id = readString(record?.id) ?? readNumber(record?.id)?.toString();
    const state = readString(record?.state);
    sprints.push({ name, ...(id ? { id } : {}), ...(state ? { state } : {}) });
  }
  return sprints;
}

/**
 * Finds the sprint custom field by shape: a sprint entry always carries a `state` or `boardId`
 * alongside its name, which distinguishes it from ordinary multi-select custom fields that would
 * otherwise look identical.
 *
 * Closed sprints are kept. Showing an item's sprint history is useful — it is how you see that
 * something has been carried three times — and native Jira only surfaces the current one.
 */
export function readSprintsFromRaw(raw: Record<string, unknown>): ReadonlyArray<WorkItemSprintRef> {
  for (const [fieldName, value] of Object.entries(raw)) {
    if (!fieldName.startsWith("customfield_") || !Array.isArray(value)) continue;

    const looksLikeSprint = value.some((entry) => {
      const record = readRecord(entry);
      return record !== undefined && ("state" in record || "boardId" in record);
    });
    if (!looksLikeSprint) continue;

    const sprints = readSprintList(value);
    if (sprints.length > 0) return sprints;
  }
  return [];
}

/**
 * Story points.
 *
 * The normalizer resolves the site's real estimate field id via Jira's field catalogue and exposes
 * it as `fields.storyPoints`, so that is the authoritative source. The `customfield_*` candidates
 * below are only a fallback for snapshots captured before that resolution existed; they are the
 * conventional ids across Jira Cloud sites, not a guess.
 */
export function readStoryPoints(
  normalized: Record<string, unknown>,
  raw: Record<string, unknown>,
): number | undefined {
  const fromNormalized = readNumber(normalized.storyPoints) ?? readNumber(normalized.estimate);
  if (fromNormalized !== undefined) return fromNormalized;

  for (const candidate of ["customfield_10016", "customfield_10024", "customfield_10002"]) {
    const value = readNumber(raw[candidate]);
    if (value !== undefined) return value;
  }
  return undefined;
}
