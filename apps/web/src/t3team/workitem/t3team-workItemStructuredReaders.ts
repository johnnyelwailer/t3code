import type {
  WorkItemNamedRef,
  WorkItemParentRef,
  WorkItemStatus,
  WorkItemTimeTracking,
} from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  readDisplayName,
  readNumber,
  readRecord,
  readString,
} from "~/t3team/workitem/t3team-workItemFieldReaders";

export function readNamedRefList(value: unknown): ReadonlyArray<WorkItemNamedRef> {
  if (!Array.isArray(value)) return [];
  const refs: WorkItemNamedRef[] = [];
  for (const entry of value) {
    const name = readDisplayName(entry);
    if (!name) continue;
    const id = readString(readRecord(entry)?.id);
    refs.push({ name, ...(id ? { id } : {}) });
  }
  return refs;
}

export function readStatus(value: unknown): WorkItemStatus | undefined {
  const name = readDisplayName(value);
  if (!name) return undefined;

  const category = readRecord(readRecord(value)?.statusCategory);
  const categoryKey = readString(category?.key);
  const categoryName = readString(category?.name);

  return {
    name,
    ...(categoryKey ? { categoryKey } : {}),
    ...(categoryName ? { categoryName } : {}),
  };
}

/**
 * Jira's `timetracking` field reports seconds under `*Seconds` keys. Some responses only carry the
 * human strings (`2d 4h`); those are intentionally ignored rather than parsed back into seconds,
 * because the parse depends on the site's hours-per-day configuration.
 */
export function readTimeTracking(value: unknown): WorkItemTimeTracking | undefined {
  const record = readRecord(value);
  if (!record) return undefined;

  const originalEstimateSeconds = readNumber(record.originalEstimateSeconds);
  const remainingEstimateSeconds = readNumber(record.remainingEstimateSeconds);
  const timeSpentSeconds = readNumber(record.timeSpentSeconds);

  if (
    originalEstimateSeconds === undefined &&
    remainingEstimateSeconds === undefined &&
    timeSpentSeconds === undefined
  ) {
    return undefined;
  }

  return {
    ...(originalEstimateSeconds !== undefined ? { originalEstimateSeconds } : {}),
    ...(remainingEstimateSeconds !== undefined ? { remainingEstimateSeconds } : {}),
    ...(timeSpentSeconds !== undefined ? { timeSpentSeconds } : {}),
  };
}

export function readParentRef(value: unknown): WorkItemParentRef | undefined {
  const record = readRecord(value);
  if (!record) return undefined;

  const key = readString(record.key) ?? readString(record.id);
  if (!key) return undefined;

  const parentFields = readRecord(record.fields);
  const summary = readString(record.summary) ?? readString(parentFields?.summary);
  const issueTypeRecord = readRecord(parentFields?.issuetype) ?? readRecord(record.issuetype);
  const issueType = readDisplayName(issueTypeRecord) ?? readString(record.issueType);
  const issueTypeIconUrl =
    readString(issueTypeRecord?.iconUrl) ?? readString(record.issueTypeIconUrl);
  const statusName =
    readDisplayName(readRecord(parentFields?.status)) ?? readString(record.statusName);

  return {
    key,
    ...(summary ? { summary } : {}),
    ...(issueType ? { issueType } : {}),
    ...(issueTypeIconUrl ? { issueTypeIconUrl } : {}),
    ...(statusName ? { statusName } : {}),
  };
}

/** Counts live under `watches.watchCount` / `votes.votes` in raw Jira responses. */
export function readWatchState(value: unknown): {
  readonly count?: number;
  readonly isActive?: boolean;
} {
  const record = readRecord(value);
  if (!record) return {};
  const count = readNumber(record.watchCount);
  const isActive = typeof record.isWatching === "boolean" ? record.isWatching : undefined;
  return {
    ...(count !== undefined ? { count } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
}

export function readVoteState(value: unknown): {
  readonly count?: number;
  readonly isActive?: boolean;
} {
  const record = readRecord(value);
  if (!record) return {};
  const count = readNumber(record.votes);
  const isActive = typeof record.hasVoted === "boolean" ? record.hasVoted : undefined;
  return {
    ...(count !== undefined ? { count } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
}
