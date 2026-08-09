import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

/** A Jira version or component reference, kept as id + name so pickers can write back by id. */
export type WorkItemNamedRef = {
  readonly id?: string;
  readonly name: string;
};

export type WorkItemSprintRef = {
  readonly id?: string;
  readonly name: string;
  readonly state?: string;
};

export type WorkItemTimeTracking = {
  readonly originalEstimateSeconds?: number;
  readonly remainingEstimateSeconds?: number;
  readonly timeSpentSeconds?: number;
};

export type WorkItemStatus = {
  readonly name: string;
  readonly categoryKey?: string;
  readonly categoryName?: string;
};

export type WorkItemParentRef = {
  readonly key: string;
  readonly summary?: string;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly statusName?: string;
};

/**
 * Everything the detail view reads about a work item, resolved once from the snapshot.
 *
 * Fields are optional throughout: Jira hides fields per project configuration and per permission,
 * so absence is normal rather than exceptional. The rail renders only what is present, which is
 * why there is no "Unspecified" placeholder anywhere in this model.
 */
export type WorkItemFieldModel = {
  readonly key: string;
  readonly title: string;
  readonly url?: string;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly isSubtask?: boolean;

  readonly status?: WorkItemStatus;
  readonly resolution?: string;
  readonly priority?: string;
  readonly priorityIconUrl?: string;

  readonly assignee?: WorkItemPerson;
  readonly reporter?: WorkItemPerson;
  readonly creator?: WorkItemPerson;

  readonly labels: ReadonlyArray<string>;
  readonly components: ReadonlyArray<WorkItemNamedRef>;
  readonly fixVersions: ReadonlyArray<WorkItemNamedRef>;
  readonly affectsVersions: ReadonlyArray<WorkItemNamedRef>;
  readonly sprints: ReadonlyArray<WorkItemSprintRef>;

  readonly createdMs?: number;
  readonly updatedMs?: number;
  readonly dueDateMs?: number;
  readonly resolvedMs?: number;

  readonly storyPoints?: number;
  readonly timeTracking?: WorkItemTimeTracking;

  readonly watchCount?: number;
  readonly isWatching?: boolean;
  readonly voteCount?: number;
  readonly hasVoted?: boolean;

  readonly environment?: string;
  readonly parent?: WorkItemParentRef;

  /** Raw ADF description document, when Jira returned one. Rendered by the ADF renderer. */
  readonly descriptionAdf?: unknown;
  /** Markdown/plain fallback for sites or snapshots without an ADF body. */
  readonly descriptionText?: string;
  /** Jira's own rendered HTML, retained only as a last-resort fallback. */
  readonly descriptionHtml?: string;
};

/** Seconds → a compact human duration using Jira's own week/day/hour/minute vocabulary. */
export function formatWorkItemDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;

  const units: ReadonlyArray<readonly [label: string, size: number]> = [
    ["w", 5 * 8 * 3600],
    ["d", 8 * 3600],
    ["h", 3600],
    ["m", 60],
  ];

  const parts: string[] = [];
  let remaining = Math.round(seconds);
  for (const [label, size] of units) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count}${label}`);
      remaining -= count * size;
    }
    if (parts.length === 2) break;
  }

  return parts.length > 0 ? parts.join(" ") : "<1m";
}

/** True when a due date has passed and the item is not already resolved. */
export function isWorkItemOverdue(model: WorkItemFieldModel, nowMs: number): boolean {
  if (model.dueDateMs === undefined) return false;
  if (model.resolvedMs !== undefined) return false;
  if (model.status?.categoryKey?.toLowerCase() === "done") return false;
  return model.dueDateMs < nowMs;
}
