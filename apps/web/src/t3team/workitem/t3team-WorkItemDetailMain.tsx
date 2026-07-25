import { useMemo, type ReactNode } from "react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { createJiraTicketAssetUrlResolver } from "~/t3team/components/ticket/t3team-ticketAssetUrls";
import type {
  JiraAttachment,
  JiraCommentItem,
} from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { T3TeamAdfRenderer } from "~/t3team/workitem/adf/t3team-AdfRenderer";
import type { AdfDocument } from "~/t3team/workitem/adf/t3team-adfRendererTypes";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import { WorkItemAttachments } from "~/t3team/workitem/t3team-WorkItemAttachments";
import { WorkItemChildren } from "~/t3team/workitem/t3team-WorkItemChildren";
import { WorkItemComments } from "~/t3team/workitem/t3team-WorkItemComments";
import { WorkItemDescription } from "~/t3team/workitem/t3team-WorkItemDescription";
import { WorkItemDetailLayout } from "~/t3team/workitem/t3team-WorkItemDetailLayout";
import { WorkItemLinks } from "~/t3team/workitem/t3team-WorkItemLinks";
import { WorkItemProperties } from "~/t3team/workitem/t3team-WorkItemProperties";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { WorkItemSkeleton } from "~/t3team/workitem/t3team-WorkItemSkeleton";
import { WorkItemTitleBand } from "~/t3team/workitem/t3team-WorkItemTitleBand";

export type WorkItemDetailMainProps = {
  readonly model: WorkItemFieldModel;
  readonly projectId: string;
  readonly accountId?: string | undefined;
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
  /** Extra sections rendered under the description — GitHub activity, draft review. */
  readonly supplementalSections?: ReactNode;
};

/**
 * The work item's content column.
 *
 * Replaces the previous stack of bordered cards. The description leads because it is what the
 * reader came for; everything else is a section under it, and the discussion column is separated so
 * a wide display can show the item and its conversation together.
 */
export function WorkItemDetailMain({
  model,
  projectId,
  accountId,
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
  supplementalSections,
}: WorkItemDetailMainProps) {
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

  return (
    <WorkItemDetailLayout
      titleBand={<WorkItemTitleBand model={model} />}
      properties={<WorkItemProperties model={model} nowMs={nowMs} />}
      primary={
        <>
          {error ? (
            <T3TeamErrorState error={error} action="load this work item" onRetry={onReload} />
          ) : null}

          <WorkItemSection title="Description">
            {/* Only the first load shows a skeleton; a refresh keeps the current content visible. */}
            {loading && !model.descriptionAdf && !model.descriptionText ? (
              <WorkItemSkeleton lines={4} />
            ) : (
              <WorkItemDescription
                model={model}
                resolveAssetUrl={resolveAssetUrl}
                onOpenIssue={onOpenTicket}
                {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
              />
            )}
          </WorkItemSection>

          <WorkItemChildren items={childItems} onOpenTicket={onOpenTicket} />

          <WorkItemLinks
            snapshotRaw={snapshotRaw}
            projectTickets={projectTickets}
            projectId={projectId}
            onOpenTicket={onOpenTicket}
          />

          <WorkItemAttachments
            attachments={attachments}
            {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
            nowMs={nowMs}
          />

          {supplementalSections}
        </>
      }
      discussion={
        <WorkItemComments
          comments={comments}
          nowMs={nowMs}
          {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
          renderBody={renderCommentBody}
          {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
        />
      }
    />
  );
}
