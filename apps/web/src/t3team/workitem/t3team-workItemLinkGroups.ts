import type { ProjectTicket } from "~/t3team/t3team-types";

export type WorkItemLinkedIssue = {
  readonly key: string;
  readonly ticket?: ProjectTicket;
};

export type WorkItemLinkGroup = {
  readonly label: string;
  readonly issues: ReadonlyArray<WorkItemLinkedIssue>;
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readKey(value: unknown): string | undefined {
  const key = readRecord(value)?.key;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : undefined;
}

function readLabel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Groups a Jira issue's `issuelinks` by the link type's own label ("blocks", "is blocked by",
 * "relates to", ...) rather than the three-way relation bucket `t3team-ticketRelationshipKeys.ts`
 * collapses those into. The detail view wants Jira's own wording verbatim and in link order, so a
 * group of linked issues reads exactly like it does inside Jira.
 *
 * `snapshotRaw` is the raw Jira issue payload (`ResourceSnapshot.raw`); `findTicket` resolves a
 * linked key against the caller's already-loaded project tickets so a row can render a real
 * summary/status/assignee instead of just a key.
 */
export function groupWorkItemIssueLinks(
  snapshotRaw: unknown,
  findTicket: (key: string) => ProjectTicket | undefined,
): ReadonlyArray<WorkItemLinkGroup> {
  const fields = readRecord(readRecord(snapshotRaw)?.fields);
  const issueLinks = fields?.issuelinks;
  if (!Array.isArray(issueLinks)) return [];

  const order: string[] = [];
  const groups = new Map<string, WorkItemLinkedIssue[]>();
  const seen = new Set<string>();

  const addIssue = (label: string | undefined, key: string | undefined) => {
    if (!label || !key) return;
    const dedupeKey = `${label}:${key}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    const ticket = findTicket(key);
    groups.get(label)!.push({ key, ...(ticket ? { ticket } : {}) });
  };

  for (const link of issueLinks) {
    const record = readRecord(link);
    if (!record) continue;
    const type = readRecord(record.type);
    addIssue(readLabel(type?.inward), readKey(record.inwardIssue));
    addIssue(readLabel(type?.outward), readKey(record.outwardIssue));
  }

  return order.map((label) => ({ label, issues: groups.get(label)! }));
}

/**
 * How many linked issues an item has, without resolving any of them.
 *
 * The section nav needs a count before the rows are built, and it needs one even when none of the
 * linked keys are in the loaded project tickets — an unresolvable link still exists.
 */
export function countWorkItemIssueLinks(snapshotRaw: unknown): number {
  return groupWorkItemIssueLinks(snapshotRaw, () => undefined).reduce(
    (total, group) => total + group.issues.length,
    0,
  );
}
