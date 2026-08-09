import type { WorkItemSectionNavEntry } from "~/t3team/workitem/t3team-WorkItemSectionNav";
import { countWorkItemIssueLinks } from "~/t3team/workitem/t3team-workItemLinkGroups";

export type WorkItemSectionAnchors = {
  readonly description: string;
  readonly children: string;
  readonly links: string;
  readonly attachments: string;
  readonly comments: string;
};

/**
 * Anchors are namespaced by item key so two work items rendered at once — a detail view beside a
 * preview, say — cannot produce duplicate element ids.
 */
export function buildWorkItemSectionAnchors(itemKey: string): WorkItemSectionAnchors {
  return {
    description: `wi-${itemKey}-description`,
    children: `wi-${itemKey}-children`,
    links: `wi-${itemKey}-links`,
    attachments: `wi-${itemKey}-attachments`,
    comments: `wi-${itemKey}-comments`,
  };
}

/**
 * Nav entries for the sections that actually have content.
 *
 * Empty sections are omitted rather than shown as zero: a chip reading "Files 0" is a worse answer
 * to "are there files" than no chip at all.
 */
export function buildWorkItemSectionNavEntries({
  anchors,
  childCount,
  snapshotRaw,
  attachmentCount,
  commentCount,
}: {
  readonly anchors: WorkItemSectionAnchors;
  readonly childCount: number;
  readonly snapshotRaw: unknown;
  readonly attachmentCount: number;
  readonly commentCount: number;
}): ReadonlyArray<WorkItemSectionNavEntry> {
  const linkCount = countWorkItemIssueLinks(snapshotRaw);

  return [
    { anchorId: anchors.description, label: "Description" },
    ...(childCount > 0
      ? [{ anchorId: anchors.children, label: "Children", count: childCount }]
      : []),
    ...(linkCount > 0 ? [{ anchorId: anchors.links, label: "Links", count: linkCount }] : []),
    ...(attachmentCount > 0
      ? [{ anchorId: anchors.attachments, label: "Files", count: attachmentCount }]
      : []),
    ...(commentCount > 0
      ? [{ anchorId: anchors.comments, label: "Comments", count: commentCount }]
      : []),
  ];
}
