type RelationshipKeyGroups = {
  parentKey?: string;
  childKeys: string[];
  referenceKeys: string[];
};

function normalizeKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[\"“”]/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractParentKey(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const fields = (raw as Record<string, unknown>).fields;
  if (!fields || typeof fields !== "object") return undefined;
  const parent = (fields as Record<string, unknown>).parent;
  if (!parent || typeof parent !== "object") return undefined;
  return normalizeKey((parent as Record<string, unknown>).key);
}

function extractSubtaskKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const fields = (raw as Record<string, unknown>).fields;
  if (!fields || typeof fields !== "object") return [];
  const subtasks = (fields as Record<string, unknown>).subtasks;
  if (!Array.isArray(subtasks)) return [];

  const keys = new Set<string>();
  for (const subtask of subtasks) {
    if (!subtask || typeof subtask !== "object") continue;
    const key = normalizeKey((subtask as Record<string, unknown>).key);
    if (key) keys.add(key);
  }
  return [...keys];
}

function extractIssueLinkKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const fields = (raw as Record<string, unknown>).fields;
  if (!fields || typeof fields !== "object") return [];
  const issueLinks = (fields as Record<string, unknown>).issuelinks;
  if (!Array.isArray(issueLinks)) return [];

  const keys = new Set<string>();
  for (const link of issueLinks) {
    if (!link || typeof link !== "object") continue;
    const linkRecord = link as Record<string, unknown>;
    const inward =
      linkRecord.inwardIssue && typeof linkRecord.inwardIssue === "object"
        ? (linkRecord.inwardIssue as Record<string, unknown>)
        : undefined;
    const outward =
      linkRecord.outwardIssue && typeof linkRecord.outwardIssue === "object"
        ? (linkRecord.outwardIssue as Record<string, unknown>)
        : undefined;
    const inwardKey = normalizeKey(inward?.key);
    const outwardKey = normalizeKey(outward?.key);
    if (inwardKey) keys.add(inwardKey);
    if (outwardKey) keys.add(outwardKey);
  }

  return [...keys];
}

export function extractRelationshipKeys(snapshotRaw: unknown): RelationshipKeyGroups {
  const parentKey = extractParentKey(snapshotRaw);
  return {
    ...(parentKey ? { parentKey } : {}),
    childKeys: extractSubtaskKeys(snapshotRaw),
    referenceKeys: extractIssueLinkKeys(snapshotRaw),
  };
}

export function normalizeRelationshipKey(value: unknown): string | undefined {
  return normalizeKey(value);
}
