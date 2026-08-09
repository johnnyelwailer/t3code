import type { ProjectTicket } from "~/t3team/t3team-types";

export type WorkItemLinkedIssue = {
  readonly key: string;
  readonly ticket?: ProjectTicket;
  /** The Jira issue link's own id (`issuelinks[].id`), needed to delete this specific link. */
  readonly linkId?: string;
  /** The link type's neutral name (e.g. "Blocks"), as `createIssueLink` needs it — distinct from
   * `label`, which is the directional phrase ("blocks" / "is blocked by") shown to the reader. */
  readonly linkTypeName?: string;
  /** Which side of the link type the *current* issue is on, for re-creating this exact link. */
  readonly direction?: "inward" | "outward";
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

  const addIssue = (
    label: string | undefined,
    key: string | undefined,
    linkId: string | undefined,
    linkTypeName: string | undefined,
    direction: "inward" | "outward",
  ) => {
    if (!label || !key) return;
    const dedupeKey = `${label}:${key}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    const ticket = findTicket(key);
    groups.get(label)!.push({
      key,
      ...(ticket ? { ticket } : {}),
      ...(linkId ? { linkId } : {}),
      ...(linkTypeName ? { linkTypeName, direction } : {}),
    });
  };

  for (const link of issueLinks) {
    const record = readRecord(link);
    if (!record) continue;
    const type = readRecord(record.type);
    const linkId = readLabel(record.id);
    const linkTypeName = readLabel(type?.name);
    addIssue(readLabel(type?.inward), readKey(record.inwardIssue), linkId, linkTypeName, "inward");
    addIssue(
      readLabel(type?.outward),
      readKey(record.outwardIssue),
      linkId,
      linkTypeName,
      "outward",
    );
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
