export type RelationshipIssueLink = {
  key: string;
  relation: "blocked-by" | "blocks" | "related";
  description?: string;
};

export type RelationshipKeyGroups = {
  parentKey?: string;
  childKeys: string[];
  referenceKeys: string[];
  blockedByKeys: string[];
  blockingKeys: string[];
  issueLinks: RelationshipIssueLink[];
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

function normalizeIssueLinkDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function classifyIssueLinkRelation(
  description: string | undefined,
): RelationshipIssueLink["relation"] {
  if (!description) return "related";
  if (description.includes("blocked by") || description.includes("depends on")) {
    return "blocked-by";
  }
  if (
    description === "blocks" ||
    description.includes("is depended on by") ||
    description.includes("is required by")
  ) {
    return "blocks";
  }
  return "related";
}

function extractIssueLinks(raw: unknown): RelationshipIssueLink[] {
  if (!raw || typeof raw !== "object") return [];
  const fields = (raw as Record<string, unknown>).fields;
  if (!fields || typeof fields !== "object") return [];
  const issueLinks = (fields as Record<string, unknown>).issuelinks;
  if (!Array.isArray(issueLinks)) return [];

  const links = new Map<string, RelationshipIssueLink>();
  for (const link of issueLinks) {
    if (!link || typeof link !== "object") continue;
    const linkRecord = link as Record<string, unknown>;
    const linkType =
      linkRecord.type && typeof linkRecord.type === "object"
        ? (linkRecord.type as Record<string, unknown>)
        : undefined;
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
    if (inwardKey) {
      const description = normalizeIssueLinkDescription(linkType?.inward);
      const relation = classifyIssueLinkRelation(description);
      links.set(`${relation}:${inwardKey}`, {
        key: inwardKey,
        relation,
        ...(description ? { description } : {}),
      });
    }
    if (outwardKey) {
      const description = normalizeIssueLinkDescription(linkType?.outward);
      const relation = classifyIssueLinkRelation(description);
      links.set(`${relation}:${outwardKey}`, {
        key: outwardKey,
        relation,
        ...(description ? { description } : {}),
      });
    }
  }

  return [...links.values()];
}

export function extractRelationshipKeys(snapshotRaw: unknown): RelationshipKeyGroups {
  const parentKey = extractParentKey(snapshotRaw);
  const issueLinks = extractIssueLinks(snapshotRaw);
  return {
    ...(parentKey ? { parentKey } : {}),
    childKeys: extractSubtaskKeys(snapshotRaw),
    referenceKeys: [...new Set(issueLinks.map((link) => link.key))],
    blockedByKeys: issueLinks
      .filter((link) => link.relation === "blocked-by")
      .map((link) => link.key),
    blockingKeys: issueLinks.filter((link) => link.relation === "blocks").map((link) => link.key),
    issueLinks,
  };
}

export function normalizeRelationshipKey(value: unknown): string | undefined {
  return normalizeKey(value);
}
