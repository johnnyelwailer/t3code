import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

const { mockReadLocalApi, mockReadPrimaryServerSettings, mockUpdatePrimaryServerSettings } =
  vi.hoisted(() => ({
    mockReadLocalApi: vi.fn(),
    mockReadPrimaryServerSettings: vi.fn(),
    mockUpdatePrimaryServerSettings: vi.fn(),
  }));

vi.mock("~/localApi", () => ({
  readLocalApi: mockReadLocalApi,
}));

// Server settings no longer hang off `LocalApi` (upstream retired `LocalApi.server` in the
// 2026-08 sync); they are reached through the environment RPC via this adapter.
vi.mock("~/t3team/hooks/t3team-serverSettingsAccess", () => ({
  readPrimaryServerSettings: mockReadPrimaryServerSettings,
  updatePrimaryServerSettings: mockUpdatePrimaryServerSettings,
}));

import {
  migrateLegacyStoredSidebarPinsToServer,
  persistStoredSidebarPins,
  readStoredSidebarPinsFromClientSettings,
  readStoredSidebarPinsFromServerSettings,
} from "~/t3team/hooks/t3team-sidebarPinPersistence";
import {
  buildGitHubActivitySidebarPinnedItem,
  buildTicketSidebarPinnedItem,
} from "~/t3team/t3team-sidebarPinningTypes";

describe("sidebar pin persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadLocalApi.mockReturnValue(null);
    mockReadPrimaryServerSettings.mockReturnValue(null);
    mockUpdatePrimaryServerSettings.mockResolvedValue(undefined);
  });

  it("reads persisted sidebar pins from server settings", () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    const githubPin = buildGitHubActivitySidebarPinnedItem({
      projectId: "project-1",
      activityId: "activity-1",
      pinnedAt: "2026-05-23T11:59:00.000Z",
    });

    expect(
      readStoredSidebarPinsFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin, githubPin]),
      }),
    ).toEqual([jiraPin, githubPin]);
  });

  it("reads persisted sidebar pins from client settings", () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    const githubPin = buildGitHubActivitySidebarPinnedItem({
      projectId: "project-1",
      activityId: "activity-1",
      pinnedAt: "2026-05-23T11:59:00.000Z",
    });

    expect(
      readStoredSidebarPinsFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin, githubPin]),
      }),
    ).toEqual([jiraPin, githubPin]);
  });

  it("dedupes persisted sidebar pins by id and keeps the latest payload", () => {
    const original = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T11:00:00.000Z",
    });
    const replacement = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });

    expect(
      readStoredSidebarPinsFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredSidebarPinsJson: JSON.stringify([original, replacement]),
      }),
    ).toEqual([replacement]);
  });

  it("migrates legacy client sidebar pins into server settings", async () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    const setClientSettings = vi.fn().mockResolvedValue(undefined);

    mockReadPrimaryServerSettings.mockReturnValue(DEFAULT_SERVER_SETTINGS);
    mockReadLocalApi.mockReturnValue({
      persistence: {
        getClientSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_CLIENT_SETTINGS,
          t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin]),
        }),
        setClientSettings,
      },
    });

    await expect(migrateLegacyStoredSidebarPinsToServer()).resolves.toEqual([jiraPin]);
    expect(mockUpdatePrimaryServerSettings).toHaveBeenCalledWith({
      t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin]),
    });
    expect(setClientSettings).toHaveBeenCalledWith({
      ...DEFAULT_CLIENT_SETTINGS,
      t3teamStoredSidebarPinsJson: "",
    });
  });

  // Regression: `readPrimaryServerSettings` must report "not loaded" as null rather than as
  // DEFAULT_SERVER_SETTINGS. Reading defaults mid-load makes the migration below conclude the
  // server has no pins and overwrite the user's real, already-synced pins from stale local state.
  it("does not migrate while server settings are still loading", async () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });

    mockReadPrimaryServerSettings.mockReturnValue(null);
    mockReadLocalApi.mockReturnValue({
      persistence: {
        getClientSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_CLIENT_SETTINGS,
          t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin]),
        }),
        setClientSettings: vi.fn().mockResolvedValue(undefined),
      },
    });

    await expect(migrateLegacyStoredSidebarPinsToServer()).resolves.toBeNull();
    expect(mockUpdatePrimaryServerSettings).not.toHaveBeenCalled();
  });

  it("persists sidebar pins through server settings", async () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    persistStoredSidebarPins([jiraPin]);

    await vi.waitFor(() => {
      expect(mockUpdatePrimaryServerSettings).toHaveBeenCalledWith({
        t3teamStoredSidebarPinsJson: JSON.stringify([jiraPin]),
      });
    });
  });
});
