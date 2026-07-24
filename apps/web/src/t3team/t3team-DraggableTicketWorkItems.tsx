import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3team/t3team-ProjectDashboardItemViews";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";

type TicketCardProps = ComponentProps<typeof TicketWorkItemCard>;
type TicketRowProps = ComponentProps<typeof TicketWorkItemRow>;

function DraggableTicketShell({
  capabilities,
  dragLabel,
  children,
}: {
  capabilities: AgentContextCapabilities | null;
  dragLabel: string;
  children: React.ReactNode;
}) {
  const dragProps = useT3TeamAgentContextDrag({ capabilities, label: dragLabel });

  return (
    <div
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      className={cn(dragProps.draggable ? "cursor-grab active:cursor-grabbing" : null, "min-w-0")}
      data-t3team-agent-context-drag-source={dragProps.draggable ? "true" : undefined}
    >
      {children}
    </div>
  );
}

export function DraggableTicketWorkItemCard(
  props: TicketCardProps & { capabilities: AgentContextCapabilities | null; dragLabel: string },
) {
  const { capabilities, dragLabel, ...cardProps } = props;

  return (
    <DraggableTicketShell capabilities={capabilities} dragLabel={dragLabel}>
      <TicketWorkItemCard {...cardProps} />
    </DraggableTicketShell>
  );
}

export function DraggableTicketWorkItemRow(
  props: TicketRowProps & { capabilities: AgentContextCapabilities | null; dragLabel: string },
) {
  const { capabilities, dragLabel, ...rowProps } = props;

  return (
    <DraggableTicketShell capabilities={capabilities} dragLabel={dragLabel}>
      <TicketWorkItemRow {...rowProps} />
    </DraggableTicketShell>
  );
}
