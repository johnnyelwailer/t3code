import type { NavigationState } from "@react-navigation/native";
import { describe, expect, it } from "vite-plus/test";

import {
  androidWorkspaceSettingsOpen,
  androidWorkspaceTabFromNavigationState,
  androidWorkspaceTabNavigationState,
} from "../features/workspace/android-workspace-tabs";
import {
  initialWorkspaceTabsState,
  workspaceTabsReducer,
} from "../features/workspace/workspace-tabs-state";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";
import {
  launchWorkspaceTab,
  lateLaunchSelection,
  nativeWorkspaceTabs,
  visibleWorkspaceTab,
  workspacePaneTabs,
} from "./t3team-workspaceExtraTab";

const Component = () => null;
const extra: WorkspaceExtraTab = {
  id: "nexi",
  placement: "start",
  title: "Nexi",
  selectOnLaunch: true,
  Component,
};
const center: WorkspaceExtraTab = { id: "nexi", placement: "center", title: "Nexi", Component };

describe("without an extra tab the workspace is stock", () => {
  it("keeps the two panes and the three native destinations, with no titles to override", () => {
    expect(workspacePaneTabs(null)).toEqual(["threads", "pullRequests"]);
    expect(nativeWorkspaceTabs(null)).toEqual([
      { id: "threads" },
      { id: "pullRequests" },
      { id: "settings" },
    ]);
    expect(launchWorkspaceTab(null)).toBe("threads");
    expect(lateLaunchSelection(null, initialWorkspaceTabsState())).toBeNull();
    expect(visibleWorkspaceTab("threads", null)).toBe("threads");
  });
});

describe("an extra tab", () => {
  it("goes first, or in the centre between Chats and Pull requests, settings stays last", () => {
    expect(workspacePaneTabs(extra)).toEqual(["extra", "threads", "pullRequests"]);
    expect(workspacePaneTabs(center)).toEqual(["threads", "extra", "pullRequests"]);
    expect(nativeWorkspaceTabs(extra)).toEqual([
      { id: "extra", title: "Nexi" },
      { id: "threads" },
      { id: "pullRequests" },
      { id: "settings" },
    ]);
    expect(nativeWorkspaceTabs(center).map((tab) => tab.id)).toEqual([
      "threads",
      "extra",
      "pullRequests",
      "settings",
    ]);
  });

  it("is selected at launch only when it asks for it", () => {
    expect(launchWorkspaceTab(extra)).toBe("extra");
    expect(launchWorkspaceTab(center)).toBe("threads");
    expect(initialWorkspaceTabsState("extra").selectedTab).toBe("extra");
    expect(initialWorkspaceTabsState().selectedTab).toBe("threads");
  });

  it("selects a late arrival once, while the user has not chosen a tab", () => {
    const untouched = initialWorkspaceTabsState();
    expect(lateLaunchSelection(extra, untouched)).toEqual({ type: "select", tab: "extra" });
    expect(lateLaunchSelection(center, untouched)).toBeNull();
    expect(lateLaunchSelection(extra, initialWorkspaceTabsState("extra"))).toBeNull();
    const chosen = workspaceTabsReducer(untouched, { type: "select", tab: "pullRequests" });
    expect(lateLaunchSelection(extra, chosen)).toBeNull();
  });

  it("falls back to Chats when the distribution takes it away while selected", () => {
    expect(visibleWorkspaceTab("extra", extra)).toBe("extra");
    expect(visibleWorkspaceTab("extra", null)).toBe("threads");
    expect(visibleWorkspaceTab("pullRequests", null)).toBe("pullRequests");
  });

  it("keeps its own query and scroll position like the other tabs", () => {
    let state = initialWorkspaceTabsState("extra");
    state = workspaceTabsReducer(state, { type: "scroll", tab: "extra", offset: 90 });
    state = workspaceTabsReducer(state, { type: "select", tab: "threads" });
    expect(state.tabs.extra.scrollOffset).toBe(90);
    expect(state.tabs.threads.scrollOffset).toBe(0);
  });
});

describe("the navigation state of the extra tab", () => {
  const state = {
    key: "root",
    index: 2,
    routeNames: ["Home", "Thread"],
    routes: [
      { key: "h", name: "Home" },
      { key: "t", name: "Thread" },
      { key: "s", name: "SettingsSheet" },
    ],
    stale: false,
    type: "stack",
  } as unknown as NavigationState;

  it("resets to Home alone, like Chats, and is not Settings", () => {
    const next = androidWorkspaceTabNavigationState(state, "extra");
    expect(next).toEqual(androidWorkspaceTabNavigationState(state, "threads"));
    expect(next.routes.map((route) => route.name)).toEqual(["Home"]);
    expect(androidWorkspaceSettingsOpen(next as NavigationState)).toBe(false);
  });

  it("stays selected after leaving Settings, and Settings still wins while it is on top", () => {
    const home = { ...state, index: 0 } as NavigationState;
    expect(androidWorkspaceTabFromNavigationState(home, "extra")).toBe("extra");
    expect(androidWorkspaceTabFromNavigationState(state, "extra")).toBe("settings");
  });
});
