import type { ReactNode } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { JiraAttachment } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemAttachments } from "~/t3team/workitem/t3team-WorkItemAttachments";
import { WorkItemChildren } from "~/t3team/workitem/t3team-WorkItemChildren";
import type { WorkItemSectionTarget } from "~/t3team/workitem/t3team-useWorkItemDetailMainContent";
import { WorkItemLinks } from "~/t3team/workitem/t3team-WorkItemLinks";
import type { WorkItemSectionAnchors } from "~/t3team/workitem/t3team-workItemSectionAnchors";

type SectionMenu = (
  section: WorkItemSectionTarget,
  label: string,
) => { onContextMenu: (event: React.MouseEvent) => void } | Record<string, never>;

/**
 * Child items, links, attachments plus any supplemental sections — the bounded reference lane,
 * extracted out of `WorkItemDetailMain` so its own line count doesn't grow every time one of these
 * sections gains a mutation control (this is where Slice C's direct link/child controls live). The
 * conversation (comments) is not here: it travels with the description in the primary column.
 */
export function WorkItemSecondaryColumn({
  issueKey,
  projectId,
  externalProjectId,
  accountId,
  backend,
  currentUserName,
  anchors,
  sectionMenu,
  childItems,
  projectTickets,
  snapshotRaw,
  attachments,
  nowMs,
  estimateFieldLabel,
  resolveAssetUrl,
  onOpenTicket,
  onReload,
  supplementalSections,
}: {
  readonly issueKey: string;
  /** t3team's project id — used for local ticket refs and draft scoping. */
  readonly projectId: string;
  /** Jira's project id, for calls that reach Atlassian. A different id space to `projectId`. */
  readonly externalProjectId?: string | undefined;
  readonly accountId?: string | undefined;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly currentUserName?: string | undefined;
  readonly anchors: WorkItemSectionAnchors;
  readonly sectionMenu: SectionMenu;
  readonly childItems: ReadonlyArray<ProjectTicket>;
  readonly projectTickets: ReadonlyArray<ProjectTicket>;
  readonly snapshotRaw: unknown;
  readonly attachments: ReadonlyArray<JiraAttachment>;
  readonly nowMs: number;
  /** The project's story-point field label, resolved server-side; absent means "not known". */
  readonly estimateFieldLabel?: string | undefined;
  readonly resolveAssetUrl?: ((url: string) => string) | undefined;
  readonly onOpenTicket: (ticketId: string) => void;
  readonly onReload: () => void;
  readonly supplementalSections?: ReactNode;
}) {
  const writeProps = { backend, accountId, issueIdOrKey: issueKey, onReload };

  return (
    <>
      <WorkItemChildren
        items={childItems}
        anchorId={anchors.children}
        onOpenTicket={onOpenTicket}
        {...(externalProjectId ? { externalProjectId } : {})}
        {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
        {...writeProps}
        {...(currentUserName ? { currentUserName } : {})}
        {...sectionMenu("relationships", `${issueKey} child items`)}
      />

      <WorkItemLinks
        snapshotRaw={snapshotRaw}
        projectTickets={projectTickets}
        projectId={projectId}
        anchorId={anchors.links}
        onOpenTicket={onOpenTicket}
        {...writeProps}
        {...(currentUserName ? { currentUserName } : {})}
        {...sectionMenu("relationships", `${issueKey} linked issues`)}
      />

      <WorkItemAttachments
        attachments={attachments}
        anchorId={anchors.attachments}
        {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
        nowMs={nowMs}
        {...sectionMenu("attachments", `${issueKey} attachments`)}
      />

      {supplementalSections}
    </>
  );
}
