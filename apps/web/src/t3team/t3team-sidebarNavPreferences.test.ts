import { describe, expect, it } from "vite-plus/test";

import {
  filterHiddenSidebarItems,
  prioritizeSidebarItemId,
  prioritizeSidebarItemIds,
  reorderSidebarItemsInScope,
  removeSidebarItemIdsFromOrder,
  sortSidebarItemsByStoredOrder,
} from "~/t3team/t3team-sidebarNavPreferences";

describe("sidebar nav preferences helpers", () => {
  it("filters hidden sidebar items by id", () => {
    expect(
      filterHiddenSidebarItems(
        [{ id: "ticket-1" }, { id: "ticket-2" }, { id: "ticket-3" }],
        ["ticket-2"],
      ),
    ).toEqual([{ id: "ticket-1" }, { id: "ticket-3" }]);
  });

  it("sorts sidebar items by the stored manual order before leaving the rest in place", () => {
    expect(
      sortSidebarItemsByStoredOrder(
        [{ id: "ticket-3" }, { id: "ticket-1" }, { id: "ticket-2" }],
        ["ticket-2", "ticket-1"],
      ),
    ).toEqual([{ id: "ticket-2" }, { id: "ticket-1" }, { id: "ticket-3" }]);
  });

  it("moves a pinned sidebar item to the top of the stored order", () => {
    expect(prioritizeSidebarItemId(["ticket-3", "ticket-1", "ticket-2"], "ticket-2")).toEqual([
      "ticket-2",
      "ticket-3",
      "ticket-1",
    ]);
  });

  it("can prioritize multiple sidebar items in order", () => {
    expect(
      prioritizeSidebarItemIds(["ticket-4", "ticket-2", "ticket-1"], ["ticket-3", "ticket-2"]),
    ).toEqual(["ticket-3", "ticket-2", "ticket-4", "ticket-1"]);
  });

  it("can remove sidebar items from the stored order", () => {
    expect(
      removeSidebarItemIdsFromOrder(["ticket-3", "ticket-2", "ticket-1"], ["ticket-2", "ticket-4"]),
    ).toEqual(["ticket-3", "ticket-1"]);
  });

  it("reorders items within a visible scope and preserves unrelated stored ids", () => {
    expect(
      reorderSidebarItemsInScope({
        orderedItemIds: ["ticket-4", "ticket-2", "ticket-1"],
        scopeItemIds: ["ticket-1", "ticket-2", "ticket-3"],
        sourceItemId: "ticket-3",
        targetItemId: "ticket-2",
      }),
    ).toEqual(["ticket-3", "ticket-2", "ticket-1", "ticket-4"]);
  });
});
