/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  getProjectDashboardModeStorageKey,
  readPersistedProjectDashboardModeState,
  resolveProjectDashboardModeState,
  writePersistedProjectDashboardModeState,
} from "./t3team-projectDashboardModeState";

describe("project dashboard mode persistence", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("opens a new session on My work even if Backlog was last chosen in an earlier one", () => {
    const key = getProjectDashboardModeStorageKey("p1");
    // What an earlier build left behind: the last-clicked view, persisted across launches.
    window.localStorage.setItem(key, JSON.stringify({ dashboardMode: "backlog" }));
    expect(
      resolveProjectDashboardModeState({ persisted: readPersistedProjectDashboardModeState(key) }),
    ).toEqual({ dashboardMode: "my-work" });
  });

  it("keeps the chosen view for the rest of the session", () => {
    const key = getProjectDashboardModeStorageKey("p1");
    writePersistedProjectDashboardModeState(key, { dashboardMode: "backlog" });
    expect(readPersistedProjectDashboardModeState(key)).toEqual({ dashboardMode: "backlog" });
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
