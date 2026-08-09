// Reader helpers for the Slice A read-parity field additions to
// `normalizeIssue` (see docs/t3team-mvp/41-work-item-detail-redesign.md).
// Split out of normalize.ts to keep that file from growing past its natural
// size — every function here is a small typed reader over a raw Jira field
// value, following the same style as the `extractLabels` / `extractDisplayName`
// family in normalize.ts.

export type JiraStatusCategorySnapshot = {
  readonly key?: string;
  readonly name?: string;
  readonly colorName?: string;
};

export type JiraIssueTimeTrackingSnapshot = {
  readonly originalEstimateSeconds?: number;
  readonly remainingEstimateSeconds?: number;
  readonly timeSpentSeconds?: number;
};

export type JiraParentSummary = {
  readonly key: string;
  readonly summary?: string;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly statusName?: string;
};

/** Picks the largest available avatar URL, falling back to whatever is present. */
export function pickAvatarUrl(avatarUrls: Record<string, string> | undefined): string | undefined {
  if (!avatarUrls) return undefined;
  return (
    avatarUrls["48x48"] ??
    avatarUrls["32x32"] ??
    avatarUrls["24x24"] ??
    Object.values(avatarUrls)[0]
  );
}

function readStringField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : undefined;
}

function readIconUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const iconUrl = (value as Record<string, unknown>).iconUrl;
  return typeof iconUrl === "string" ? iconUrl : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNameList(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map((entry) => readName(entry))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? names : undefined;
}

export function extractCreated(fields: Record<string, unknown>): string | undefined {
  return readStringField(fields, "created");
}

export function extractDueDate(fields: Record<string, unknown>): string | undefined {
  return readStringField(fields, "duedate");
}

export function extractResolutionName(fields: Record<string, unknown>): string | undefined {
  return readName(fields.resolution);
}

export function extractResolvedAt(fields: Record<string, unknown>): string | undefined {
  return readStringField(fields, "resolutiondate");
}

export function extractComponents(
  fields: Record<string, unknown>,
): ReadonlyArray<string> | undefined {
  return readNameList(fields.components);
}

export function extractFixVersions(
  fields: Record<string, unknown>,
): ReadonlyArray<string> | undefined {
  return readNameList(fields.fixVersions);
}

/** Jira's "versions" field is the issue's Affects Version/s. */
export function extractAffectsVersions(
  fields: Record<string, unknown>,
): ReadonlyArray<string> | undefined {
  return readNameList(fields.versions);
}

export function extractWatchCount(fields: Record<string, unknown>): number | undefined {
  const watches = fields.watches;
  if (!watches || typeof watches !== "object") return undefined;
  return readNumber((watches as Record<string, unknown>).watchCount);
}

export function extractIsWatching(fields: Record<string, unknown>): boolean | undefined {
  const watches = fields.watches;
  if (!watches || typeof watches !== "object") return undefined;
  const isWatching = (watches as Record<string, unknown>).isWatching;
  return typeof isWatching === "boolean" ? isWatching : undefined;
}

export function extractVoteCount(fields: Record<string, unknown>): number | undefined {
  const votes = fields.votes;
  if (!votes || typeof votes !== "object") return undefined;
  return readNumber((votes as Record<string, unknown>).votes);
}

export function extractHasVoted(fields: Record<string, unknown>): boolean | undefined {
  const votes = fields.votes;
  if (!votes || typeof votes !== "object") return undefined;
  const hasVoted = (votes as Record<string, unknown>).hasVoted;
  return typeof hasVoted === "boolean" ? hasVoted : undefined;
}

export function extractTimeTracking(
  fields: Record<string, unknown>,
): JiraIssueTimeTrackingSnapshot | undefined {
  const timetracking = fields.timetracking;
  if (!timetracking || typeof timetracking !== "object") return undefined;
  const obj = timetracking as Record<string, unknown>;
  const originalEstimateSeconds = readNumber(obj.originalEstimateSeconds);
  const remainingEstimateSeconds = readNumber(obj.remainingEstimateSeconds);
  const timeSpentSeconds = readNumber(obj.timeSpentSeconds);
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

export function extractStatusCategory(status: unknown): JiraStatusCategorySnapshot | undefined {
  if (!status || typeof status !== "object") return undefined;
  const statusCategory = (status as Record<string, unknown>).statusCategory;
  if (!statusCategory || typeof statusCategory !== "object") return undefined;
  const obj = statusCategory as Record<string, unknown>;
  const key = typeof obj.key === "string" ? obj.key : undefined;
  const name = typeof obj.name === "string" ? obj.name : undefined;
  const colorName = typeof obj.colorName === "string" ? obj.colorName : undefined;
  if (key === undefined && name === undefined && colorName === undefined) return undefined;
  return {
    ...(key !== undefined ? { key } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(colorName !== undefined ? { colorName } : {}),
  };
}

/** Raw ADF document for `fields.description`/`fields.environment`, unmodified — for the ADF renderer, not the markdown fallback. */
export function extractAdfDocument(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

export function extractParentSummary(parent: unknown): JiraParentSummary | undefined {
  if (!parent || typeof parent !== "object") return undefined;
  const obj = parent as Record<string, unknown>;
  const key = typeof obj.key === "string" ? obj.key : undefined;
  if (!key) return undefined;
  const parentFields = obj.fields;
  const parentFieldsRecord =
    parentFields && typeof parentFields === "object"
      ? (parentFields as Record<string, unknown>)
      : undefined;
  const summary = parentFieldsRecord ? readSummary(parentFieldsRecord) : undefined;
  const issueType = parentFieldsRecord ? readName(parentFieldsRecord.issuetype) : undefined;
  const issueTypeIconUrl = parentFieldsRecord
    ? readIconUrl(parentFieldsRecord.issuetype)
    : undefined;
  const statusName = parentFieldsRecord ? readName(parentFieldsRecord.status) : undefined;

  return {
    key,
    ...(summary !== undefined ? { summary } : {}),
    ...(issueType !== undefined ? { issueType } : {}),
    ...(issueTypeIconUrl !== undefined ? { issueTypeIconUrl } : {}),
    ...(statusName !== undefined ? { statusName } : {}),
  };
}

function readSummary(fields: Record<string, unknown>): string | undefined {
  return typeof fields.summary === "string" ? fields.summary : undefined;
}
