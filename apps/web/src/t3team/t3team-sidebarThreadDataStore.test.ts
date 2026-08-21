import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { InboxWorkItemAttribution } from "~/t3team/t3team-inboxWorkItems";
import type { SubRunCounts } from "~/t3team/hooks/t3team-useChildThreadRelations";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";

function makeAttribution(displayId: string): InboxWorkItemAttribution {
  return { ticketId: displayId, displayId, title: "", url: null };
}

function makeCounts(total: number, running = 0): SubRunCounts {
  return { total, running };
}

describe("useT3TeamSidebarThreadDataStore", () => {
  beforeEach(() => {
    // Reset store to empty state between tests via direct setState.
    useT3TeamSidebarThreadDataStore.setState({
      attributionByThreadId: new Map(),
      subRunCountsByParentId: new Map(),
    });
  });

  describe("setAttributionByThreadId", () => {
    it("stores the provided map and exposes it via state", () => {
      const map = new Map<string, InboxWorkItemAttribution | null>([
        ["t1", makeAttribution("PROJ-1")],
      ]);
      useT3TeamSidebarThreadDataStore.getState().setAttributionByThreadId(map);
      expect(useT3TeamSidebarThreadDataStore.getState().attributionByThreadId).toBe(map);
    });

    it("skips setState when called with the same reference (identity-stable)", () => {
      const map = new Map<string, InboxWorkItemAttribution | null>([
        ["t1", makeAttribution("PROJ-1")],
      ]);
      useT3TeamSidebarThreadDataStore.getState().setAttributionByThreadId(map);

      const stateBefore = useT3TeamSidebarThreadDataStore.getState();
      // Same reference — should be a no-op (setter returns early).
      useT3TeamSidebarThreadDataStore.getState().setAttributionByThreadId(map);

      expect(useT3TeamSidebarThreadDataStore.getState()).toBe(stateBefore);
    });

    it("updates state when called with a different reference", () => {
      const map1 = new Map<string, InboxWorkItemAttribution | null>([
        ["t1", makeAttribution("PROJ-1")],
      ]);
      const map2 = new Map<string, InboxWorkItemAttribution | null>([
        ["t2", makeAttribution("PROJ-2")],
      ]);
      useT3TeamSidebarThreadDataStore.getState().setAttributionByThreadId(map1);
      useT3TeamSidebarThreadDataStore.getState().setAttributionByThreadId(map2);
      expect(useT3TeamSidebarThreadDataStore.getState().attributionByThreadId).toBe(map2);
    });
  });

  describe("setSubRunCountsByParentId", () => {
    it("stores the provided map", () => {
      const map = new Map([["parent-1", makeCounts(3, 1)]]);
      useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(map);
      expect(useT3TeamSidebarThreadDataStore.getState().subRunCountsByParentId).toBe(map);
    });

    it("skips setState when called with the same reference", () => {
      const map = new Map([["parent-1", makeCounts(2)]]);
      useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(map);
      const stateBefore = useT3TeamSidebarThreadDataStore.getState();
      useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(map);
      expect(useT3TeamSidebarThreadDataStore.getState()).toBe(stateBefore);
    });
  });
});
