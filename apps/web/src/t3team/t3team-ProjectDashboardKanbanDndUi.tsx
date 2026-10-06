import {
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  type CollisionDetection,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import {
  ProjectDashboardKanbanCollapsedColumn,
  ProjectDashboardKanbanColumnHeader,
} from "~/t3team/t3team-ProjectDashboardKanbanColumnChrome";
import type { ProjectTicketKanbanColumnId } from "~/t3team/t3team-projectTicketStatus";

const lanePrefix = "kanban-lane:";
const ticketPrefix = "kanban-ticket:";

export function readKanbanColumnId(
  value: string | null | undefined,
): ProjectTicketKanbanColumnId | undefined {
  if (!value?.startsWith(lanePrefix)) return undefined;
  const columnId = value.slice(lanePrefix.length);
  return columnId.length > 0 ? columnId : undefined;
}

export function readKanbanTicketId(value: string | null | undefined): string | undefined {
  return value?.startsWith(ticketPrefix) ? value.slice(ticketPrefix.length) : undefined;
}

export const projectDashboardKanbanLaneCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

export function ProjectDashboardKanbanDroppableLane({
  columnId,
  title,
  count,
  dragging,
  collapsed = false,
  onToggleCollapsed,
  children,
}: {
  columnId: ProjectTicketKanbanColumnId;
  title: string;
  count: number;
  dragging: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
  children: React.ReactNode;
}) {
  // A collapsed strip stays a drop target: dropping on it moves the ticket into that status.
  const { isOver, setNodeRef } = useDroppable({ id: `${lanePrefix}${columnId}` });

  return (
    <div
      ref={setNodeRef}
      className={collapsed ? "w-11 self-stretch" : "min-w-[17rem] self-stretch"}
    >
      <T3SurfacePanel
        tone="soft"
        className={`flex h-full flex-col border-border/85 @container/kanban-lane ${collapsed ? "p-0" : "p-2"} ${dragging && isOver ? "bg-primary/5 ring-1 ring-primary/40" : ""}`}
      >
        {collapsed ? (
          <ProjectDashboardKanbanCollapsedColumn
            title={title}
            count={count}
            onExpand={() => onToggleCollapsed?.(false)}
          />
        ) : (
          <>
            <ProjectDashboardKanbanColumnHeader
              title={title}
              count={count}
              {...(onToggleCollapsed ? { onCollapse: () => onToggleCollapsed(true) } : {})}
            />
            <div className="min-h-[12rem] flex-1">{children}</div>
          </>
        )}
      </T3SurfacePanel>
    </div>
  );
}

export function ProjectDashboardKanbanDroppableColumnBody({
  columnId,
  title,
  count,
  dragging,
  collapsed = false,
  onToggleCollapsed,
  className,
  style,
}: {
  columnId: ProjectTicketKanbanColumnId;
  title: string;
  count: number;
  dragging: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `${lanePrefix}${columnId}` });

  return (
    <div
      ref={setNodeRef}
      className={`relative self-stretch ${collapsed ? "w-11" : "min-w-[17rem]"} ${className ?? ""}`}
      style={style}
    >
      <T3SurfacePanel
        tone="soft"
        className={`flex h-full min-h-[12rem] flex-col rounded-xl border-border/85 @container/kanban-lane ${collapsed ? "p-0" : "p-2"} ${dragging && isOver ? "bg-primary/5 ring-1 ring-primary/40" : ""}`}
      >
        {collapsed ? (
          <ProjectDashboardKanbanCollapsedColumn
            title={title}
            count={count}
            onExpand={() => onToggleCollapsed?.(false)}
          />
        ) : (
          <>
            <ProjectDashboardKanbanColumnHeader
              title={title}
              count={count}
              {...(onToggleCollapsed ? { onCollapse: () => onToggleCollapsed(true) } : {})}
            />
            <div className="min-h-[12rem] flex-1" />
          </>
        )}
      </T3SurfacePanel>
    </div>
  );
}

export function ProjectDashboardKanbanDraggableCard({
  ticketId,
  disabled,
  pending,
  children,
}: {
  ticketId: string;
  disabled: boolean;
  pending: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${ticketPrefix}${ticketId}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`${disabled ? "" : "cursor-grab active:cursor-grabbing"} ${isDragging ? "z-20 opacity-80" : ""} ${pending ? "opacity-70 motion-safe:animate-pulse" : ""}`}
      aria-busy={pending}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
