import { useCallback, useMemo, useState, type CSSProperties } from "react";

import {
  buildProjectDashboardKanbanMatrixLayout,
  PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS,
  resolveProjectDashboardKanbanMatrixLayout,
} from "~/t3team/t3team-projectDashboardKanbanMatrix";
import { buildProjectDashboardKanbanMatrixShellRenderPlan } from "~/t3team/t3team-projectDashboardKanbanMatrixShellRenderPlan";
import { resolveProjectDashboardKanbanMatrixVisibleHierarchy } from "~/t3team/t3team-projectDashboardKanbanMatrixVisibleHierarchy";
import type { TicketHierarchy } from "~/t3team/t3team-projectDashboardKanbanHierarchy";
import type { ProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export const PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_HEIGHT_PX = 8;
export const PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_GAP_PX = 4;
export const PROJECT_DASHBOARD_KANBAN_MATRIX_HEADER_ROWS = 5;

export function useProjectDashboardKanbanMatrixLayout({
  kanbanColumns,
  allTickets,
  parentChildGroups,
}: {
  kanbanColumns: ProjectTicketKanbanColumns;
  allTickets: readonly ProjectTicket[] | undefined;
  parentChildGroups: TicketHierarchy;
}) {
  const matchedTickets = useMemo(
    () => kanbanColumns.flatMap((column) => column.items),
    [kanbanColumns],
  );
  const hierarchySourceTickets = useMemo(() => {
    if (!allTickets || allTickets.length === 0) {
      return matchedTickets;
    }

    const matchedTicketById = new Map(matchedTickets.map((ticket) => [ticket.id, ticket]));
    return allTickets.map((ticket) => matchedTicketById.get(ticket.id) ?? ticket);
  }, [allTickets, matchedTickets]);
  const visibleHierarchy = useMemo(
    () =>
      resolveProjectDashboardKanbanMatrixVisibleHierarchy({
        ...(allTickets && allTickets.length > 0 ? { allTickets: hierarchySourceTickets } : {}),
        matchedTickets,
        parentChildGroups,
      }),
    [allTickets, hierarchySourceTickets, matchedTickets, parentChildGroups],
  );
  const baseLayout = useMemo(
    () => buildProjectDashboardKanbanMatrixLayout({ kanbanColumns, hierarchy: visibleHierarchy }),
    [kanbanColumns, visibleHierarchy],
  );
  const [measuredRowSpanByPlacementKey, setMeasuredRowSpanByPlacementKey] = useState<
    Readonly<Record<string, number>>
  >({});
  const layout = useMemo(
    () =>
      resolveProjectDashboardKanbanMatrixLayout({
        layout: baseLayout,
        measuredRowSpanByPlacementKey: new Map(Object.entries(measuredRowSpanByPlacementKey)),
      }),
    [baseLayout, measuredRowSpanByPlacementKey],
  );
  const shellHeaderPlacementKeys = useMemo(
    () => new Set(layout.shells.map((shell) => shell.placementKey)),
    [layout.shells],
  );
  const shellRenderPlans = useMemo(
    () => buildProjectDashboardKanbanMatrixShellRenderPlan(layout.shells),
    [layout.shells],
  );
  const directVisibleParentIdByChildId = useMemo(() => {
    const parentIdByChildId = new Map<string, string>();
    for (const [parentId, children] of visibleHierarchy.childrenByParentId.entries()) {
      for (const child of children) {
        parentIdByChildId.set(child.id, parentId);
      }
    }
    return parentIdByChildId;
  }, [visibleHierarchy]);
  const placementByTicketId = useMemo(
    () => new Map(layout.cards.map((placement) => [placement.ticket.id, placement])),
    [layout.cards],
  );
  const shellDepthByPlacementKey = useMemo(() => {
    const depthByPlacementKey = new Map<string, number>();

    const getShellDepth = (ticketId: string): number => {
      const placement = placementByTicketId.get(ticketId);
      if (!placement || !shellHeaderPlacementKeys.has(placement.placementKey)) {
        return 0;
      }

      const cachedDepth = depthByPlacementKey.get(placement.placementKey);
      if (cachedDepth !== undefined) {
        return cachedDepth;
      }

      const parentId = directVisibleParentIdByChildId.get(ticketId);
      const parentPlacement = parentId ? placementByTicketId.get(parentId) : undefined;
      const shellDepth =
        parentPlacement && shellHeaderPlacementKeys.has(parentPlacement.placementKey)
          ? getShellDepth(parentId!) + 1
          : 0;

      depthByPlacementKey.set(placement.placementKey, shellDepth);
      return shellDepth;
    };

    for (const shell of layout.shells) {
      getShellDepth(shell.ticket.id);
    }

    return depthByPlacementKey;
  }, [
    directVisibleParentIdByChildId,
    layout.shells,
    placementByTicketId,
    shellHeaderPlacementKeys,
  ]);
  const inlineRelationshipPlacementKeys = useMemo(() => {
    const childPlacementKeys = new Set<string>();
    const parentPlacementKeys = new Set<string>();

    for (const placement of layout.cards) {
      const parentId = directVisibleParentIdByChildId.get(placement.ticket.id);
      if (!parentId) {
        continue;
      }

      const parentPlacement = placementByTicketId.get(parentId);
      if (!parentPlacement) {
        continue;
      }

      const parentHasShell = shellHeaderPlacementKeys.has(parentPlacement.placementKey);
      const placementHasShell = shellHeaderPlacementKeys.has(placement.placementKey);
      if (parentHasShell) {
        if (!placementHasShell) {
          childPlacementKeys.add(placement.placementKey);
        }
        continue;
      }

      if (parentPlacement.columnIndex !== placement.columnIndex) {
        continue;
      }
      if (parentPlacement.columnSpan !== 1 || placement.columnSpan !== 1) {
        continue;
      }

      childPlacementKeys.add(placement.placementKey);
      parentPlacementKeys.add(parentPlacement.placementKey);
    }

    return { childPlacementKeys, parentPlacementKeys };
  }, [directVisibleParentIdByChildId, layout.cards, placementByTicketId, shellHeaderPlacementKeys]);
  const handleMeasuredRowSpan = useCallback((placementKey: string, rowSpan: number) => {
    setMeasuredRowSpanByPlacementKey((current) =>
      current[placementKey] === rowSpan ? current : { ...current, [placementKey]: rowSpan },
    );
  }, []);
  const boardRowCount = Math.max(layout.maxRow, PROJECT_DASHBOARD_KANBAN_MATRIX_MIN_CARD_ROWS + 6);
  const boardBodyStyle = {
    gridTemplateColumns: `repeat(${kanbanColumns.length}, minmax(17rem, 1fr))`,
    gridAutoRows: `${PROJECT_DASHBOARD_KANBAN_MATRIX_ROW_HEIGHT_PX}px`,
  } satisfies CSSProperties;

  return {
    layout,
    shellHeaderPlacementKeys,
    shellRenderPlans,
    shellDepthByPlacementKey,
    inlineRelationshipPlacementKeys,
    handleMeasuredRowSpan,
    boardRowCount,
    boardBodyStyle,
  };
}
