import { useMemo, type ReactNode } from "react";

import { createJiraTicketAssetUrlResolver } from "~/t3team/components/ticket/t3team-ticketAssetUrls";
import type {
  JiraAttachment,
  JiraCommentItem,
} from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { T3TeamAdfRenderer } from "~/t3team/workitem/adf/t3team-AdfRenderer";
import type { AdfDocument } from "~/t3team/workitem/adf/t3team-adfRendererTypes";
import { countWorkItemScalarDrafts, useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  buildWorkItemSectionAnchors,
  buildWorkItemSectionNavEntries,
} from "~/t3team/workitem/t3team-workItemSectionAnchors";

/** The sections a reader can hand to the agent, mirroring the targets the previous view exposed. */
export type WorkItemSectionTarget = "description" | "relationships" | "attachments" | "comments";

/**
 * Everything `WorkItemDetailMain` needs to prepare before it can render, pulled out so the component
 * itself stays composition-only. None of this holds state of its own — it is derived once per render
 * from the same props the component already receives.
 */
export function useWorkItemDetailMainContent({
  model,
  projectId,
  accountId,
  httpBaseUrl,
  workspaceRoot,
  htmlBaseUrl,
  attachments,
  childCount,
  snapshotRaw,
  commentCount,
  onOpenTicket,
  onSectionContextMenu,
}: {
  readonly model: WorkItemFieldModel;
  readonly projectId: string;
  readonly accountId?: string | undefined;
  readonly httpBaseUrl?: string | undefined;
  readonly workspaceRoot?: string | undefined;
  readonly htmlBaseUrl?: string | undefined;
  readonly attachments: ReadonlyArray<JiraAttachment>;
  readonly childCount: number;
  readonly snapshotRaw: unknown;
  readonly commentCount: number;
  readonly onOpenTicket: (ticketId: string) => void;
  readonly onSectionContextMenu?:
    | ((event: React.MouseEvent, section: WorkItemSectionTarget, label: string) => void)
    | undefined;
}) {
  const resolveAssetUrl = useMemo(
    () =>
      createJiraTicketAssetUrlResolver({
        projectId,
        ticketKey: model.key,
        ...(accountId ? { accountId } : {}),
        ...(httpBaseUrl ? { httpBaseUrl } : {}),
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {}),
        attachments: [...attachments],
      }),
    [accountId, attachments, htmlBaseUrl, httpBaseUrl, model.key, projectId, workspaceRoot],
  );

  const anchors = buildWorkItemSectionAnchors(model.key);
  const navEntries = buildWorkItemSectionNavEntries({
    anchors,
    childCount,
    snapshotRaw,
    attachmentCount: attachments.length,
    commentCount,
  });

  // Scalar drafts only: description/comment drafts already have their own visible review panel, so
  // counting them here too would double-announce the same proposed change.
  const draftsByField = useWorkItemDrafts({ projectId, issueIdOrKey: model.key });
  const draftCount = countWorkItemScalarDrafts(draftsByField);

  const sectionMenu = (section: WorkItemSectionTarget, label: string) =>
    onSectionContextMenu
      ? { onContextMenu: (event: React.MouseEvent) => onSectionContextMenu(event, section, label) }
      : {};

  /**
   * Comment bodies render from ADF for the same reason descriptions do — it is the format Jira
   * stores, so nothing is lost on the way in or, later, on the way back out.
   *
   * Returning `null` defers to the comment component's own HTML/markdown fallback, which is what a
   * comment cached before ADF capture will need.
   */
  const renderCommentBody = (comment: JiraCommentItem): ReactNode =>
    comment.bodyAdf ? (
      <T3TeamAdfRenderer
        doc={comment.bodyAdf as AdfDocument}
        {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
        onOpenIssue={onOpenTicket}
      />
    ) : null;

  return { resolveAssetUrl, anchors, navEntries, sectionMenu, renderCommentBody, draftCount };
}
