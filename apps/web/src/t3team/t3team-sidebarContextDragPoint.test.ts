import { describe, expect, it } from "vite-plus/test";

import type { SidebarListItem } from "~/components/Sidebar.logic";
import { isSidebarReorderTarget, isThreadContextDragPoint } from "./t3team-sidebarContextDragPoint";

const thread = (key: string, section: "pinned" | "active" | "working" | "snoozed") =>
  ({ kind: "thread", key, section }) satisfies SidebarListItem;

const items: readonly SidebarListItem[] = [
  thread("p1", "pinned"),
  { kind: "marker", marker: "pinned-divider" },
  thread("a1", "active"),
  thread("a2", "active"),
  thread("a3", "active"),
  { kind: "marker", marker: "working-header" },
  thread("w1", "working"),
  { kind: "marker", marker: "snoozed-header" },
  thread("s1", "snoozed"),
];

const activeKeys = ["a1", "a2", "a3"];
const planBase = {
  items,
  pinnedOrder: ["p1"],
  pinnedKeysById: new Map([["p1", "m"]]),
  activeOrder: activeKeys,
  activeKeysById: new Map([
    ["a1", "b"],
    ["a2", "d"],
    ["a3", "f"],
  ]),
  reorderableKeys: new Set(["p1", ...activeKeys]),
  activeReorderableKeys: new Set(activeKeys),
};

/** What Sidebar.tsx evaluates at one pointer position while `draggedKey` is being dragged. */
function contextDragAt(input: {
  draggedKey: string;
  draggedSection: "active" | "working";
  hoveredRowKey: string | null;
  timeOrdered?: boolean;
}) {
  return isThreadContextDragPoint({
    pointerOutsideList: false,
    hoveredRowKey: input.hoveredRowKey,
    draggedKey: input.draggedKey,
    isReorderTarget: (overId) =>
      isSidebarReorderTarget({
        ...planBase,
        overId,
        activeKey: input.draggedKey,
        activeSection: input.draggedSection,
        activeTimeOrdered: input.timeOrdered ?? false,
      }),
  });
}

describe("isThreadContextDragPoint", () => {
  it("keeps a same-section reorder a reorder", () => {
    expect(contextDragAt({ draggedKey: "a1", draggedSection: "active", hoveredRowKey: "a2" })).toBe(
      false,
    );
  });

  it("is a context drop over rows that cannot take the thread as a reorder", () => {
    for (const hoveredRowKey of ["w1", "s1"]) {
      expect(contextDragAt({ draggedKey: "a1", draggedSection: "active", hoveredRowKey })).toBe(
        true,
      );
    }
  });

  it("is a context drop where the reorder would change nothing", () => {
    expect(
      contextDragAt({
        draggedKey: "a1",
        draggedSection: "active",
        hoveredRowKey: "a2",
        timeOrdered: true,
      }),
    ).toBe(true);
  });

  it("is a context drop from the working shelf, which cannot reorder at all", () => {
    expect(
      contextDragAt({ draggedKey: "w1", draggedSection: "working", hoveredRowKey: "a1" }),
    ).toBe(true);
  });

  it("is not a context drop over the dragged row itself or empty list space", () => {
    expect(contextDragAt({ draggedKey: "a1", draggedSection: "active", hoveredRowKey: "a1" })).toBe(
      false,
    );
    expect(contextDragAt({ draggedKey: "a1", draggedSection: "active", hoveredRowKey: null })).toBe(
      false,
    );
  });

  it("is always a context drop outside the list", () => {
    expect(
      isThreadContextDragPoint({
        pointerOutsideList: true,
        hoveredRowKey: null,
        draggedKey: "a1",
        isReorderTarget: () => true,
      }),
    ).toBe(true);
  });
});
