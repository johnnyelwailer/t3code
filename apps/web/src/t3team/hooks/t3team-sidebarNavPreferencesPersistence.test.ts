import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";

import { readStoredSidebarNavPreferencesFromClientSettings } from "~/t3team/hooks/t3team-sidebarNavPreferencesPersistence";

describe("sidebar nav preferences persistence", () => {
  it("reads persisted hidden and ordered ids from client settings", () => {
    expect(
      readStoredSidebarNavPreferencesFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredSidebarNavPreferencesJson: JSON.stringify({
          "project-1": {
            hiddenItemIds: ["project-1:jira-work-item:ticket-9"],
            orderedItemIds: [
              "project-1:jira-work-item:ticket-2",
              "project-1:jira-work-item:ticket-1",
            ],
          },
        }),
      }),
    ).toEqual({
      "project-1": {
        hiddenItemIds: ["project-1:jira-work-item:ticket-9"],
        orderedItemIds: ["project-1:jira-work-item:ticket-2", "project-1:jira-work-item:ticket-1"],
      },
    });
  });

  it("dedupes malformed persisted ids and falls back to empty state", () => {
    expect(
      readStoredSidebarNavPreferencesFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredSidebarNavPreferencesJson: JSON.stringify({
          "project-1": {
            hiddenItemIds: [
              "project-1:jira-work-item:ticket-9",
              "project-1:jira-work-item:ticket-9",
              "",
            ],
            orderedItemIds: [
              "project-1:jira-work-item:ticket-1",
              "project-1:jira-work-item:ticket-1",
            ],
          },
          "project-2": null,
        }),
      }),
    ).toEqual({
      "project-1": {
        hiddenItemIds: ["project-1:jira-work-item:ticket-9"],
        orderedItemIds: ["project-1:jira-work-item:ticket-1"],
      },
      "project-2": {
        hiddenItemIds: [],
        orderedItemIds: [],
      },
    });
  });
});
