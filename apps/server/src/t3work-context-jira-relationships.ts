export type T3workJiraRelationshipKeys = {
  readonly parentKey?: string;
  readonly childKeys: ReadonlyArray<string>;
  readonly referenceKeys: ReadonlyArray<string>;
};

function normalizeKey(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().replace(/["“”]/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractParentKey(raw: unknown): string | undefined {
  const fields = readRecord(raw)?.fields;
  const parent = readRecord(fields)?.parent;
  return normalizeKey(readRecord(parent)?.key);
}

function extractSubtaskKeys(raw: unknown): string[] {
  const fields = readRecord(raw)?.fields;
  const subtasks = readRecord(fields)?.subtasks;
  if (!Array.isArray(subtasks)) {
    return [];
  }
  const keys = new Set<string>();
  for (const subtask of subtasks) {
    const key = normalizeKey(readRecord(subtask)?.key);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

function normalizeIssueLinkDescription(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase()
    : undefined;
}

function readIssueLinkKey(link: unknown, side: "inwardIssue" | "outwardIssue"): string | undefined {
  return normalizeKey(readRecord(readRecord(link)?.[side])?.key);
}

function extractIssueLinkKeys(raw: unknown): string[] {
  const fields = readRecord(raw)?.fields;
  const issueLinks = readRecord(fields)?.issuelinks;
  if (!Array.isArray(issueLinks)) {
    return [];
  }
  const keys = new Set<string>();
  for (const link of issueLinks) {
    const type = readRecord(readRecord(link)?.type);
    const inward = readIssueLinkKey(link, "inwardIssue");
    const outward = readIssueLinkKey(link, "outwardIssue");
    if (inward && normalizeIssueLinkDescription(type?.inward)) {
      keys.add(inward);
    }
    if (outward && normalizeIssueLinkDescription(type?.outward)) {
      keys.add(outward);
    }
  }
  return [...keys];
}

export function extractT3workJiraRelationshipKeys(raw: unknown): T3workJiraRelationshipKeys {
  const parentKey = extractParentKey(raw);
  return {
    ...(parentKey ? { parentKey } : {}),
    childKeys: extractSubtaskKeys(raw),
    referenceKeys: extractIssueLinkKeys(raw),
  };
}

export function normalizeT3workJiraKey(value: unknown): string | undefined {
  return normalizeKey(value)?.toUpperCase();
}
