import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { useWorkItemDraftStrip } from "~/t3team/workitem/t3team-useWorkItemDraftStrip";
import type { WorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import { WorkItemDraftStrip } from "~/t3team/workitem/t3team-WorkItemDraftStrip";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

type MountProps = {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  readonly model: WorkItemFieldModel;
  readonly mutations: WorkItemFieldMutations;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload: () => void;
  readonly descriptionCurrentText?: string | undefined;
  readonly onReviewDescription: () => void;
  readonly onReviewComments: () => void;
};

/**
 * Gates the strip's data-assembly hook (three field mutations plus the accept/comment/dismiss
 * wiring) behind "is this actually open" — only mounting `WorkItemDraftStripContent` while the strip
 * is open means that machinery doesn't exist at all while nobody is looking at it.
 */
export function WorkItemDraftStripMount(props: MountProps) {
  const isOpen = useWorkItemDraftReviewUiStore(
    (state) => state.openStripForIssue === props.issueIdOrKey,
  );
  if (!isOpen) return null;
  return <WorkItemDraftStripContent {...props} />;
}

function WorkItemDraftStripContent(props: MountProps) {
  const strip = useWorkItemDraftStrip(props);
  if (strip.rows.length === 0) return null;

  return (
    <WorkItemDraftStrip
      rows={strip.rows}
      resolvableCount={strip.resolvableCount}
      {...(strip.onAcceptResolvable ? { onAcceptResolvable: strip.onAcceptResolvable } : {})}
      onDismissAll={strip.onDismissAll}
    />
  );
}
