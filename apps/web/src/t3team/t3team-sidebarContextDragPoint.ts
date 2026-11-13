import {
  planSidebarThreadDrop,
  resolveSidebarDropTarget,
  type SidebarListItem,
} from "~/components/Sidebar.logic";

type ThreadDropPlanInput = Parameters<typeof planSidebarThreadDrop>[0];

/**
 * Whether dropping the dragged thread on `overId` would reorder, pin, settle or move it. The same
 * answer gates sort collisions and decides when a drag over a row is a context drop instead.
 */
export function isSidebarReorderTarget(
  input: Omit<ThreadDropPlanInput, "target"> & {
    readonly items: readonly SidebarListItem[];
    readonly overId: string;
  },
): boolean {
  const { items, overId, ...plan } = input;
  const target = resolveSidebarDropTarget(items, plan.activeKey, overId);
  return target !== null && planSidebarThreadDrop({ ...plan, target }).kind !== "none";
}

/**
 * Decides whether a sidebar thread drag is, at one pointer position, a context drop rather than a
 * reorder. Outside the list it always is; over a row it is only when that row cannot take the
 * dragged thread as a reorder (a working or snoozed shelf row, or a move that changes nothing), so
 * a same-section reorder stays a reorder.
 */
export function isThreadContextDragPoint(input: {
  readonly pointerOutsideList: boolean;
  readonly hoveredRowKey: string | null;
  readonly draggedKey: string | null;
  readonly isReorderTarget: (rowKey: string) => boolean;
}): boolean {
  if (input.pointerOutsideList) return true;
  const { hoveredRowKey } = input;
  if (hoveredRowKey === null || hoveredRowKey === input.draggedKey) return false;
  return !input.isReorderTarget(hoveredRowKey);
}

export function sidebarRowKeyAtPoint(point: { x: number; y: number }): string | null {
  const row = document
    .elementFromPoint(point.x, point.y)
    ?.closest<HTMLElement>("li[data-thread-item]");
  return row?.dataset.threadItem ?? null;
}
