import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { sideChatThreadIds } from "./t3team-sideChatPending";
import { openSideChatOptimistically } from "./t3team-useOptimisticSideChat";

const parentRef = scopeThreadRef(EnvironmentId.make("env-1"), ThreadId.make("parent"));
const threadKey = scopedThreadKey(parentRef);

function setup() {
  useRightPanelStore.setState({ byThreadKey: {} });
  useRightPanelStore.getState().openSideChat(parentRef, ThreadId.make("earlier"));
}

const panel = () =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, parentRef);

describe("openSideChatOptimistically", () => {
  it("shows a pending tab on the click and swaps in the started side chat in place", async () => {
    setup();
    let pendingTabs: string[] = [];
    let tabsRightAfterStart: string[] = [];
    const started = openSideChatOptimistically(
      parentRef,
      async () => {
        pendingTabs = panel().surfaces.map((surface) => surface.id);
        useRightPanelStore.getState().openSideChat(parentRef, ThreadId.make("started"));
        tabsRightAfterStart = sideChatThreadIds(
          useRightPanelStore.getState().byThreadKey[threadKey],
        );
        return true;
      },
      "Warum schlägt der Test fehl?",
    );

    await expect(started).resolves.toBe(true);
    expect(pendingTabs).toHaveLength(2);
    expect(pendingTabs[1]).toMatch(/^side-chat:pending-side-chat:/);
    expect(tabsRightAfterStart).toEqual(["earlier", "started"]);
    expect(panel().surfaces.map((surface) => surface.id)).toEqual([
      "side-chat:earlier",
      "side-chat:started",
    ]);
    expect(panel().activeSurfaceId).toBe("side-chat:started");
  });

  it("drops the pending tab when the side chat does not start", async () => {
    setup();

    await expect(
      openSideChatOptimistically(parentRef, async () => false, "Kurze Frage"),
    ).resolves.toBe(false);

    expect(panel().surfaces.map((surface) => surface.id)).toEqual(["side-chat:earlier"]);
    expect(panel().activeSurfaceId).toBe("side-chat:earlier");
  });
});
