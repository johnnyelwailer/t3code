import type { MouseEvent } from "react";
import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import {
  getProjectBacklogPlanningMeta,
  type ProjectBacklogPlanningState,
} from "~/t3team/t3team-projectBacklogPresentation";
import { ProjectBacklogRowAssigneeCell } from "~/t3team/t3team-ProjectBacklogRowAssigneeCell";
import {
  ProjectBacklogRowEstimateCell,
  ProjectBacklogRowSubtaskCell,
} from "~/t3team/t3team-ProjectBacklogRowPlanningCells";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectBacklogRow({
  ticket,
  estimateFieldLabel,
  canCreateSubtasks,
  onOpen,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
  capabilities,
  onContextMenu,
  ancestorPath,
  directChildCount = 0,
  descendantCount = 0,
  planningState,
  isContextOnly = false,
}: {
  ticket: ProjectTicket;
  estimateFieldLabel?: string | undefined;
  canCreateSubtasks: boolean;
  onOpen: () => void;
  onSearchAssignableUsers: (
    ticket: ProjectTicket,
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  onListChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
  onUpdateAssignee: (
    ticket: ProjectTicket,
    assignee: AtlassianAssignableUser | null,
  ) => Promise<void>;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  onCreateSubtask: (
    ticket: ProjectTicket,
    subtask: ProjectBacklogSubtaskCreateInput,
  ) => Promise<void>;
  capabilities?: AgentContextCapabilities | null;
  onContextMenu?: ((event: MouseEvent) => void) | undefined;
  ancestorPath?: ReadonlyArray<string> | undefined;
  directChildCount?: number;
  descendantCount?: number;
  planningState?: ProjectBacklogPlanningState | undefined;
  isContextOnly?: boolean | undefined;
}) {
  const resolvedPlanningState = planningState ?? "needs-owner-and-estimate";
  const planningMeta = getProjectBacklogPlanningMeta(resolvedPlanningState);
  const planningBadgeVariant: "info" | "success" | "warning" =
    resolvedPlanningState === "ready"
      ? "success"
      : resolvedPlanningState === "needs-owner-and-estimate"
        ? "warning"
        : "info";
  const dragProps = useT3TeamAgentContextDrag({
    capabilities: capabilities ?? null,
    label: `${ticket.ref.displayId} ${ticket.ref.title}`,
  });

  return (
    <div
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      className="min-w-0"
    >
      <T3SurfacePanel tone={isContextOnly ? "dashed" : "soft"} className="p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1" onContextMenu={onContextMenu}>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <JiraIssueTypeIcon
                issueType={ticket.issueType}
                issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
              />
              <span className="font-semibold text-foreground/85">{ticket.ref.displayId}</span>
              {isContextOnly ? <Badge variant="outline">Context parent</Badge> : null}
              <Badge variant={planningBadgeVariant}>{planningMeta.label}</Badge>
              {ticket.priority ? <Badge variant="secondary">{ticket.priority}</Badge> : null}
            </div>
            <button
              type="button"
              className="block w-full text-left text-[13px] font-semibold leading-5 text-foreground hover:text-primary"
              onClick={onOpen}
              title={ticket.ref.title}
            >
              <span className="line-clamp-2 break-words">{ticket.ref.title}</span>
            </button>
            {ticket.description ? (
              <p
                className="mt-1 line-clamp-2 max-w-none text-[12px] leading-4.5 text-muted-foreground"
                title={ticket.description}
              >
                {ticket.description}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-muted-foreground">
              <span>Status: {ticket.status}</span>
              {ancestorPath && ancestorPath.length > 0 ? (
                <span>Under {ancestorPath.join(" / ")}</span>
              ) : null}
              {directChildCount > 0 ? (
                <span>
                  {directChildCount} child issue{directChildCount === 1 ? "" : "s"}
                </span>
              ) : null}
              {descendantCount > directChildCount ? (
                <span>
                  {descendantCount} total descendant{descendantCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              {!ticket.assignee ? <Badge variant="warning">Unassigned</Badge> : null}
              {(ticket.subtaskCount ?? 0) > 0 ? (
                <Badge variant="outline">{ticket.subtaskCount} subtasks</Badge>
              ) : null}
            </div>
          </div>

          <div className="min-w-[4.5rem] text-right">
            <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Updated
            </div>
            <div className="mt-0.5 text-[12px] leading-4 text-foreground/80">
              {formatUpdatedAt(ticket.updatedAt)}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-start gap-3">
          <ProjectBacklogRowAssigneeCell
            ticket={ticket}
            onSearchAssignableUsers={onSearchAssignableUsers}
            onUpdateAssignee={onUpdateAssignee}
          />

          <ProjectBacklogRowEstimateCell
            ticket={ticket}
            onUpdateEstimate={onUpdateEstimate}
            {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
          />

          <ProjectBacklogRowSubtaskCell
            ticket={ticket}
            canCreateSubtasks={canCreateSubtasks}
            onCreateSubtask={onCreateSubtask}
            onSearchAssignableUsers={onSearchAssignableUsers}
            {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
          />
        </div>
      </T3SurfacePanel>
    </div>
  );
}
