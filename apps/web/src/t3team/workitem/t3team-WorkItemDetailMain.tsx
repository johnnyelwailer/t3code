import type { ReactNode } from "react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import type { JiraAttachment, JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { buildWorkItemDetailMainControls } from "~/t3team/workitem/t3team-buildWorkItemDetailMainControls";
import { WorkItemAttachments } from "~/t3team/workitem/t3team-WorkItemAttachments";
import { WorkItemChildren } from "~/t3team/workitem/t3team-WorkItemChildren";
import { WorkItemComments } from "~/t3team/workitem/t3team-WorkItemComments";
import { WorkItemDescription } from "~/t3team/workitem/t3team-WorkItemDescription";
import { WorkItemDetailLayout } from "~/t3team/workitem/t3team-WorkItemDetailLayout";
import { WorkItemLinks } from "~/t3team/workitem/t3team-WorkItemLinks";
import { WorkItemProperties } from "~/t3team/workitem/t3team-WorkItemProperties";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { WorkItemSectionNav } from "~/t3team/workitem/t3team-WorkItemSectionNav";
import { WorkItemSkeleton } from "~/t3team/workitem/t3team-WorkItemSkeleton";
import { WorkItemTitleBand } from "~/t3team/workitem/t3team-WorkItemTitleBand";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  useWorkItemDetailMainContent,
  type WorkItemSectionTarget,
} from "~/t3team/workitem/t3team-useWorkItemDetailMainContent";

export type { WorkItemSectionTarget };

export type WorkItemDetailMainProps = {
  readonly model: WorkItemFieldModel;
  readonly projectId: string;
  readonly accountId?: string | undefined;
  /** Slice B mutation access. Absent when there is no live Atlassian connection — the view stays read-only. */
  readonly backend?: AtlassianBackendApi | undefined;
  /** Jira's own project id, needed only for the status control's board-column lookup. */
  readonly externalProjectId?: string | undefined;
  readonly httpBaseUrl?: string | undefined;
  readonly workspaceRoot?: string | undefined;
  readonly htmlBaseUrl?: string | undefined;
  /** Child work items. Named `childItems` so it never collides with React's `children`. */
  readonly childItems: ReadonlyArray<ProjectTicket>;
  readonly projectTickets: ReadonlyArray<ProjectTicket>;
  readonly snapshotRaw: unknown;
  readonly attachments: ReadonlyArray<JiraAttachment>;
  readonly comments: ReadonlyArray<JiraCommentItem>;
  readonly nowMs: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onReload: () => void;
  readonly onOpenTicket: (ticketId: string) => void;
  /** Signed-in user, so rows assigned to them are distinguishable at a glance. */
  readonly currentUserName?: string | undefined;
  /**
   * Right-click on a section hands it to the agent. Supplied by the caller because building the
   * handler needs the backend, the project and the snapshot — none of which this column should own.
   */
  readonly onSectionContextMenu?:
    | ((event: React.MouseEvent, section: WorkItemSectionTarget, label: string) => void)
    | undefined;
  /** Extra sections rendered under the description — GitHub activity, draft review. */
  readonly supplementalSections?: ReactNode;
};

/**
 * The work item's content column.
 *
 * Replaces the previous stack of bordered cards. The description leads because it is what the reader
 * came for, but it is also the one block with no length limit — so it gets a column to itself, and
 * the bounded sections that used to sit after it (children, links, files, conversation) sit beside
 * it instead. Nothing important can be pushed off the page by a long description, and the
 * description itself is never truncated to achieve that.
 */
export function WorkItemDetailMain({
  model,
  projectId,
  accountId,
  backend,
  externalProjectId,
  httpBaseUrl,
  workspaceRoot,
  htmlBaseUrl,
  childItems,
  projectTickets,
  snapshotRaw,
  attachments,
  comments,
  nowMs,
  loading,
  error,
  onReload,
  onOpenTicket,
  currentUserName,
  onSectionContextMenu,
  supplementalSections,
}: WorkItemDetailMainProps) {
  const { resolveAssetUrl, anchors, navEntries, sectionMenu, renderCommentBody } =
    useWorkItemDetailMainContent({
      model,
      projectId,
      ...(accountId ? { accountId } : {}),
      ...(httpBaseUrl ? { httpBaseUrl } : {}),
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(htmlBaseUrl ? { htmlBaseUrl } : {}),
      attachments,
      childCount: childItems.length,
      snapshotRaw,
      commentCount: comments.length,
      onOpenTicket,
      ...(onSectionContextMenu ? { onSectionContextMenu } : {}),
    });

  // Editable controls need a live backend and a connected account; without either the view stays
  // read-only, same as before Slice B.
  const { statusControl, assigneeControl, estimateControl } = buildWorkItemDetailMainControls({
    model,
    ...(accountId ? { accountId } : {}),
    ...(backend ? { backend } : {}),
    ...(externalProjectId ? { externalProjectId } : {}),
    ...(currentUserName ? { currentUserName } : {}),
    onReload,
  });

  return (
    <WorkItemDetailLayout
      titleBand={
        <WorkItemTitleBand
          model={model}
          nowMs={nowMs}
          {...(currentUserName ? { currentUserName } : {})}
          {...(statusControl ? { statusControl } : {})}
          {...(assigneeControl ? { assigneeControl } : {})}
        />
      }
      sectionNav={<WorkItemSectionNav entries={navEntries} />}
      properties={
        <WorkItemProperties
          model={model}
          nowMs={nowMs}
          {...(assigneeControl ? { assigneeControl } : {})}
          {...(estimateControl ? { estimateControl } : {})}
        />
      }
      primary={
        <>
          {error ? (
            <T3TeamErrorState error={error} action="load this work item" onRetry={onReload} />
          ) : null}

          <WorkItemSection
            title="Description"
            anchorId={anchors.description}
            {...sectionMenu("description", `${model.key} description`)}
          >
            {/* Only the first load shows a skeleton; a refresh keeps the current content visible. */}
            {loading && !model.descriptionAdf && !model.descriptionText ? (
              <WorkItemSkeleton lines={4} />
            ) : (
              <WorkItemDescription
                model={model}
                {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
                onOpenIssue={onOpenTicket}
                {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
              />
            )}
          </WorkItemSection>
        </>
      }
      secondary={
        <>
          <WorkItemChildren
            items={childItems}
            anchorId={anchors.children}
            onOpenTicket={onOpenTicket}
            {...(currentUserName ? { currentUserName } : {})}
            {...sectionMenu("relationships", `${model.key} child items`)}
          />

          <WorkItemLinks
            snapshotRaw={snapshotRaw}
            projectTickets={projectTickets}
            projectId={projectId}
            anchorId={anchors.links}
            onOpenTicket={onOpenTicket}
            {...(currentUserName ? { currentUserName } : {})}
            {...sectionMenu("relationships", `${model.key} linked issues`)}
          />

          <WorkItemAttachments
            attachments={attachments}
            anchorId={anchors.attachments}
            {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
            nowMs={nowMs}
            {...sectionMenu("attachments", `${model.key} attachments`)}
          />

          <WorkItemComments
            comments={comments}
            anchorId={anchors.comments}
            nowMs={nowMs}
            {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
            renderBody={renderCommentBody}
            {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
            {...sectionMenu("comments", `${model.key} comments`)}
          />

          {supplementalSections}
        </>
      }
    />
  );
}
