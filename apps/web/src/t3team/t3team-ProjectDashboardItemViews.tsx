import type { ReactNode } from "react";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { ProjectDashboardTicketTooltip } from "~/t3team/t3team-ProjectDashboardItemViewParts";
import {
  TicketWorkItemCardMeta,
  TicketWorkItemRowMeta,
} from "~/t3team/t3team-ProjectDashboardItemMeta";
import type { KanbanZoomVisual } from "~/t3team/t3team-kanbanZoom";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

export function TicketWorkItemCard({
  ticket,
  onOpen,
  compact,
  flat,
  groupParent,
  inlineParent,
  inlineChild,
  child,
  childCount,
  zoomVisual,
  lastCheckedAt,
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  compact?: boolean;
  flat?: boolean;
  groupParent?: boolean;
  inlineParent?: boolean;
  inlineChild?: boolean;
  child?: boolean;
  childCount?: number;
  /** Continuous semantic-zoom visual; omitted renders today's card. */
  zoomVisual?: KanbanZoomVisual;
  lastCheckedAt?: number;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const showsChildRelationship = child || inlineChild;
  const titleAvatarLayout = zoomVisual?.titleAvatarLayout === true;
  const assigneeName = ticket.assignee?.trim();
  const avatarOpacity = zoomVisual?.avatarOpacity ?? 0;
  const nameOpacity = zoomVisual?.assigneeNameOpacity ?? 1;
  const showAvatar = zoomVisual !== undefined && avatarOpacity > 0.02;
  const showName = Boolean(assigneeName) && (zoomVisual === undefined || nameOpacity > 0.02);

  const avatar = showAvatar ? (
    <span style={{ opacity: avatarOpacity }} className="inline-flex shrink-0">
      <WorkItemPersonAvatar
        person={
          assigneeName
            ? {
                displayName: assigneeName,
                ...(ticket.assigneeAccountId ? { accountId: ticket.assigneeAccountId } : {}),
              }
            : undefined
        }
        size="sm"
      />
    </span>
  ) : null;

  const titleFontSize = zoomVisual?.titleFontSizeRem;
  const titleClass =
    zoomVisual === undefined
      ? compact
        ? "mt-0.5 line-clamp-2 text-[11px] leading-3.5 break-words @md/ticket-card:text-xs @md/ticket-card:leading-4 @lg/ticket-card:line-clamp-1"
        : "line-clamp-2 text-sm leading-5 break-words"
      : titleAvatarLayout
        ? "min-w-0 flex-1 truncate font-medium leading-snug"
        : // Compact: smaller type but keep 2 lines so more of the title stays readable.
          zoomVisual.titleDensity > 0.85
          ? "mt-0.5 line-clamp-1 font-medium leading-snug break-words"
          : "mt-0.5 line-clamp-2 font-medium leading-snug break-words";

  // Hierarchy: group parents read as shell headers (no card chrome); children keep a quiet card.
  const surfaceClass = child
    ? "border-0 bg-transparent shadow-none hover:translate-x-px hover:bg-accent/18 hover:shadow-none"
    : groupParent
      ? "border-0 bg-transparent shadow-none hover:translate-y-0 hover:bg-accent/12 hover:shadow-none"
      : inlineChild
        ? "border-border/50 bg-background/55 shadow-none hover:translate-x-px hover:bg-accent/10"
        : inlineParent
          ? "border-border/70 bg-background/82 shadow-none"
          : flat
            ? "border-border/80 bg-background/78 shadow-sm"
            : "border-border/95 bg-card/78 shadow-sm";

  const cardContent = (
    <div
      className={`h-full overflow-hidden rounded-md border transition-colors hover:-translate-y-px hover:bg-accent/35 hover:shadow-md @container/ticket-card ${surfaceClass}`}
    >
      <div
        className={`flex h-full flex-col ${
          titleAvatarLayout
            ? "gap-0 px-2 py-1.5"
            : groupParent
              ? "gap-1 px-3.5 py-2.5"
              : compact
                ? "gap-1 px-3.5 py-2.5"
                : "gap-3 p-3.5"
        }`}
      >
        {titleAvatarLayout ? (
          <div className="flex min-w-0 items-center gap-1">
            <JiraIssueTypeIcon
              issueType={ticket.issueType}
              issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
              className="shrink-0"
            />
            {(zoomVisual?.keyOpacity ?? 1) > 0.02 ? (
              <span
                className="shrink-0 truncate font-medium text-muted-foreground"
                style={{
                  opacity: zoomVisual?.keyOpacity ?? 1,
                  fontSize: `${Math.max(0.5, (titleFontSize ?? 0.6875) * 0.92)}rem`,
                  maxWidth: "3.75rem",
                }}
              >
                {ticket.ref.displayId}
              </span>
            ) : null}
            <div
              className={titleClass}
              style={titleFontSize !== undefined ? { fontSize: `${titleFontSize}rem` } : undefined}
            >
              {ticket.ref.title}
            </div>
            {avatar}
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-2">
            <span className={`shrink-0 ${compact ? "mt-0.5" : "mt-px"}`}>
              <JiraIssueTypeIcon
                issueType={ticket.issueType}
                issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
              />
            </span>
            <div className="min-w-0 flex-1 pr-0.5">
              <TicketWorkItemCardMeta
                ticket={ticket}
                compact={compact}
                child={child}
                inlineChild={inlineChild}
                childCount={childCount}
                {...(zoomVisual
                  ? {
                      showTicketKey: true,
                      showStatusChip: true,
                      showPriorityChip: true,
                      showUpdatedAt: zoomVisual.updatedOpacity > 0.08,
                      keyOpacity: zoomVisual.keyOpacity,
                      statusOpacity: zoomVisual.statusOpacity,
                      priorityOpacity: zoomVisual.priorityOpacity,
                      updatedOpacity: zoomVisual.updatedOpacity,
                    }
                  : {})}
              />
              <div
                className={`overflow-hidden ${groupParent ? "font-semibold tracking-tight" : "font-medium"} ${titleClass}`}
                style={
                  titleFontSize !== undefined ? { fontSize: `${titleFontSize}rem` } : undefined
                }
              >
                {ticket.ref.title}
              </div>
              {showAvatar && avatarOpacity >= nameOpacity ? (
                <div className="mt-0.5 flex items-center gap-1">{avatar}</div>
              ) : showName ? (
                <div
                  className={`truncate text-muted-foreground ${compact ? "mt-0.5 hidden text-[11px] leading-4 @lg/ticket-card:block" : "mt-1 text-xs"}`}
                  style={{ opacity: nameOpacity }}
                >
                  Assigned to {assigneeName}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`block w-full min-w-0 text-left @container/ticket-item ${showsChildRelationship ? (inlineChild ? "relative pl-3" : "relative pl-4") : ""}`}
      onContextMenu={onContextMenu}
    >
      {child ? (
        <span className="absolute top-3.5 left-1 h-px w-2.5 bg-foreground/16" aria-hidden />
      ) : null}
      <ProjectDashboardTicketTooltip
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        trigger={<button type="button" className="block w-full text-left" onClick={onOpen} />}
      >
        {cardContent}
      </ProjectDashboardTicketTooltip>
      {extraChildren}
    </div>
  );
}

export function TicketWorkItemRow({
  ticket,
  onOpen,
  child,
  childCount,
  lastCheckedAt,
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  child?: boolean;
  childCount?: number;
  lastCheckedAt?: number;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="w-full" onContextMenu={onContextMenu}>
      <ProjectDashboardTicketTooltip
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        trigger={
          <button
            type="button"
            className={`flex w-full items-start gap-2 rounded-md border border-transparent px-1 py-1 text-left transition-colors hover:border-border/50 hover:bg-accent/25 ${child ? "relative pl-3" : ""}`}
            onClick={onOpen}
          />
        }
      >
        {child && <span className="absolute top-2 left-0 h-px w-2 bg-border/70" aria-hidden />}
        <JiraIssueTypeIcon
          issueType={ticket.issueType}
          issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
        />
        <div className="min-w-0 flex-1">
          <TicketWorkItemRowMeta ticket={ticket} child={child} childCount={childCount} />
          <div className="mt-0.5 text-sm font-medium leading-5">{ticket.ref.title}</div>
          {ticket.assignee && (
            <div className="text-xs text-muted-foreground">Assigned to {ticket.assignee}</div>
          )}
        </div>
      </ProjectDashboardTicketTooltip>
      {extraChildren}
    </div>
  );
}
