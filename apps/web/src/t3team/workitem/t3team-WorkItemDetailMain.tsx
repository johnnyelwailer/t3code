import type { ReactNode } from "react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import type { JiraAttachment, JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { useWorkItemDetailMainControls } from "~/t3team/workitem/t3team-useWorkItemDetailMainControls";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { WorkItemDescription } from "~/t3team/workitem/t3team-WorkItemDescription";
import { WorkItemDescriptionDraftDiff } from "~/t3team/workitem/t3team-WorkItemDescriptionDraftDiff";
import { WorkItemDetailLayout } from "~/t3team/workitem/t3team-WorkItemDetailLayout";
import { WorkItemProperties } from "~/t3team/workitem/t3team-WorkItemProperties";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { WorkItemSecondaryColumn } from "~/t3team/workitem/t3team-WorkItemSecondaryColumn";
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
  /** The Description section header's own affordance — the "Rewrite with agent" control. */
  readonly descriptionAction?: ReactNode;
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
  descriptionAction,
}: WorkItemDetailMainProps) {
  // Built first: `mutations` is the one shared instance per field the chip and the strip both
  // commit through, so the content hook below can hand it to the strip.
  const { statusControl, assigneeControl, estimateControl, mutations } = useWorkItemDetailMainControls({
    model,
    ...(accountId ? { accountId } : {}),
    ...(backend ? { backend } : {}),
    ...(externalProjectId ? { externalProjectId } : {}),
    ...(currentUserName ? { currentUserName } : {}),
    onReload,
  });

  const { resolveAssetUrl, anchors, sectionNav, sectionMenu, renderCommentBody } =
    useWorkItemDetailMainContent({
      model,
      projectId,
      mutations,
      ...(accountId ? { accountId } : {}),
      ...(backend ? { backend } : {}),
      ...(httpBaseUrl ? { httpBaseUrl } : {}),
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(htmlBaseUrl ? { htmlBaseUrl } : {}),
      attachments,
      childCount: childItems.length,
      snapshotRaw,
      commentCount: comments.length,
      onOpenTicket,
      onReload,
      ...(onSectionContextMenu ? { onSectionContextMenu } : {}),
    });

  const isReviewingDescription = useWorkItemDraftReviewUiStore(
    (state) => state.reviewingDescriptionForIssue === model.key,
  );

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
      sectionNav={sectionNav}
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
            {...(descriptionAction ? { action: descriptionAction } : {})}
            {...sectionMenu("description", `${model.key} description`)}
          >
            {/* Only the first load shows a skeleton; a refresh keeps the current content visible. */}
            {loading && !model.descriptionAdf && !model.descriptionText ? (
              <WorkItemSkeleton lines={4} />
            ) : (
              <WorkItemDescription
                model={model}
                {...(isReviewingDescription
                  ? {
                      adfBody: (
                        <WorkItemDescriptionDraftDiff
                          issueIdOrKey={model.key}
                          projectId={projectId}
                          {...(model.descriptionText ? { currentText: model.descriptionText } : {})}
                        />
                      ),
                    }
                  : {})}
                {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
                onOpenIssue={onOpenTicket}
                {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
              />
            )}
          </WorkItemSection>
        </>
      }
      secondary={
        <WorkItemSecondaryColumn
          issueKey={model.key}
          projectId={projectId}
          {...(externalProjectId ? { externalProjectId } : {})}
          anchors={anchors}
          sectionMenu={sectionMenu}
          childItems={childItems}
          projectTickets={projectTickets}
          snapshotRaw={snapshotRaw}
          attachments={attachments}
          comments={comments}
          nowMs={nowMs}
          onOpenTicket={onOpenTicket}
          onReload={onReload}
          renderCommentBody={renderCommentBody}
          {...(accountId ? { accountId } : {})}
          {...(backend ? { backend } : {})}
          {...(currentUserName ? { currentUserName } : {})}
          {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
          {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
          supplementalSections={supplementalSections}
        />
      }
    />
  );
}
