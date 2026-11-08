import { describe, expect, it } from "vite-plus/test";

import {
  initialWorkspaceTabsState,
  workspaceTabsReducer,
} from "../features/workspace/workspace-tabs-state";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";
import {
  extraTabSelected,
  launchesOnExtraTab,
  lateLaunchSelection,
  placeExtraTab,
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
const stock = ["threads", "pullRequests", "usage"];

describe("without an extra tab the workspace is stock", () => {
  it("keeps the destinations as given and opens on the stock tab", () => {
    expect(placeExtraTab(stock, null)).toBe(stock);
    expect(launchesOnExtraTab(null)).toBe(false);
    expect(lateLaunchSelection(null, initialWorkspaceTabsState())).toBeNull();
    expect(extraTabSelected(initialWorkspaceTabsState(), null)).toBe(false);
  });
});

describe("an extra tab", () => {
  it("goes first, or in the centre right after Chats", () => {
    expect(placeExtraTab(stock, extra)).toEqual(["extra", "threads", "pullRequests", "usage"]);
    expect(placeExtraTab(stock, center)).toEqual(["threads", "extra", "pullRequests", "usage"]);
    expect(placeExtraTab(["pullRequests"], center)).toEqual(["extra", "pullRequests"]);
  });

  it("is selected at launch only when it asks for it", () => {
    expect(launchesOnExtraTab(extra)).toBe(true);
    expect(launchesOnExtraTab(center)).toBe(false);
    expect(initialWorkspaceTabsState(true).extraSelected).toBe(true);
    expect(initialWorkspaceTabsState().extraSelected).toBeUndefined();
  });

  it("selects a late arrival once, while the user has not chosen a tab", () => {
    const untouched = initialWorkspaceTabsState();
    expect(lateLaunchSelection(extra, untouched)).toEqual({ type: "selectExtra" });
    expect(lateLaunchSelection(center, untouched)).toBeNull();
    expect(lateLaunchSelection(extra, initialWorkspaceTabsState(true))).toBeNull();
    const chosen = workspaceTabsReducer(untouched, { type: "select", tab: "pullRequests" });
    expect(lateLaunchSelection(extra, chosen)).toBeNull();
  });

  it("is selected only while the distribution still provides it", () => {
    const selected = workspaceTabsReducer(initialWorkspaceTabsState(), { type: "selectExtra" });
    expect(extraTabSelected(selected, extra)).toBe(true);
    expect(extraTabSelected(selected, null)).toBe(false);
  });

  it("is left by selecting any stock tab, even the one selected before it", () => {
    const selected = workspaceTabsReducer(initialWorkspaceTabsState(), { type: "selectExtra" });
    expect(selected.selectedTab).toBe("threads");
    const left = workspaceTabsReducer(selected, { type: "select", tab: "threads" });
    expect(left.extraSelected).toBe(false);
    expect(left.selectedTab).toBe("threads");
    expect(left.selectionRevision).toBe(selected.selectionRevision + 1);
  });
});
