import { describe, expect, it } from "vite-plus/test";

import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { describeJiraConnection } from "./t3team-jiraConnectionStatus";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const synced: AtlassianAccountStatus = {
  id: "cloud-1",
  provider: "atlassian",
  label: "Philip Jonientz",
  accountUrl: "https://nexplore.atlassian.net",
  status: "connected",
  needsReconnect: false,
  lastSyncAt: new Date(NOW - 3 * HOUR).toISOString(),
};
const account = (overrides: Partial<AtlassianAccountStatus> = {}): AtlassianAccountStatus => ({
  ...synced,
  ...overrides,
});
const { lastSyncAt: _synced, ...neverSynced } = synced;

describe("Jira connection card view", () => {
  it("shows a healthy connection without any problem", () => {
    expect(describeJiraConnection(account(), NOW)).toEqual({
      title: "nexplore.atlassian.net",
      subtitle: "Philip Jonientz",
      statusLabel: "Connected",
      needsSignIn: false,
      lastSync: { text: "Last synced 3 h ago", stale: false },
      problem: null,
    });
  });

  it("turns a dead session into a sign-in prompt", () => {
    const view = describeJiraConnection(
      account({ status: "needs-reconnect", needsReconnect: true }),
      NOW,
    );
    expect(view.statusLabel).toBe("Needs sign-in");
    expect(view.needsSignIn).toBe(true);
    expect(view.problem).toContain("session expired");
  });

  it("marks a sync older than a day as stale", () => {
    const view = describeJiraConnection(
      account({ lastSyncAt: new Date(NOW - 26 * 24 * HOUR).toISOString() }),
      NOW,
    );
    expect(view.lastSync).toEqual({ text: "Last synced 26 d ago", stale: true });
  });

  it("says so when nothing has synced yet, and shows the last sync error as is", () => {
    const view = describeJiraConnection(
      { ...neverSynced, lastSyncError: "Jira did not answer." },
      NOW,
    );
    expect(view.lastSync).toEqual({ text: "Not synced yet", stale: false });
    expect(view.problem).toBe("Jira did not answer.");
  });

  it("does not print the site twice when the label is the host", () => {
    expect(describeJiraConnection(account({ label: "nexplore.atlassian.net" }), NOW).subtitle).toBe(
      null,
    );
  });
});
