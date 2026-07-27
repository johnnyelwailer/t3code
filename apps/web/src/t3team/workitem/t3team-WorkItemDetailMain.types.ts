import type { ReactNode } from "react";

import type {
  JiraAttachment,
  JiraCommentItem,
} from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import type { WorkItemSectionTarget } from "~/t3team/workitem/t3team-useWorkItemDetailMainContent";

/**
 * Split out of `t3team-WorkItemDetailMain.tsx` once that file crossed the 200-line cap — a pure type
 * declaration, so extracting it is zero-risk and keeps the component file itself readable as the
 * composition it is.
 */
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
  /** Project's story-point field label, for the child rows' estimate cell. Absent = not known. */
  readonly estimateFieldLabel?: string | undefined;
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
  /** The Description section header's own affordance — the "Rewrite" control. */
  readonly descriptionAction?: ReactNode;
};
