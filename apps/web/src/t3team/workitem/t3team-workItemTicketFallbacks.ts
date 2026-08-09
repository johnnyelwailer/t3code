import type { ProjectTicket } from "~/t3team/t3team-types";
import type {
  WorkItemSprintRef,
  WorkItemTimeTracking,
} from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  readSprintList,
  readSprintsFromRaw,
} from "~/t3team/workitem/t3team-workItemPlanningReaders";

/**
 * Fallbacks that read from the cached backlog row.
 *
 * `ProjectTicket` is the already-loaded list row, so these let the detail view paint complete
 * content on first frame instead of showing gaps until the snapshot request returns.
 */

export function resolveSprints({
  fields,
  raw,
  ticket,
}: {
  readonly fields: Record<string, unknown>;
  readonly raw: Record<string, unknown>;
  readonly ticket: ProjectTicket | undefined;
}): ReadonlyArray<WorkItemSprintRef> {
  const fromFields = readSprintList(fields.sprints);
  if (fromFields.length > 0) return fromFields;

  const fromRaw = readSprintsFromRaw(raw);
  if (fromRaw.length > 0) return fromRaw;

  return ticket?.sprintName ? [{ name: ticket.sprintName }] : [];
}

/**
 * The backlog row carries original and remaining estimates but never logged time, so a model built
 * from this fallback reports an estimate without a "logged" figure — which is accurate, rather than
 * implying nothing has been logged.
 */
export function readTimeTrackingFromTicket(
  ticket: ProjectTicket | undefined,
): WorkItemTimeTracking | undefined {
  if (!ticket) return undefined;

  const originalEstimateSeconds = ticket.timeOriginalEstimateSeconds;
  const remainingEstimateSeconds = ticket.timeRemainingEstimateSeconds;
  if (originalEstimateSeconds === undefined && remainingEstimateSeconds === undefined) {
    return undefined;
  }

  return {
    ...(originalEstimateSeconds !== undefined ? { originalEstimateSeconds } : {}),
    ...(remainingEstimateSeconds !== undefined ? { remainingEstimateSeconds } : {}),
  };
}
