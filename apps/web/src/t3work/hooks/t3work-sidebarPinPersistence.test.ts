import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

const { mockReadLocalApi } = vi.hoisted(() => ({
  mockReadLocalApi: vi.fn(),
}));

vi.mock("~/localApi", () => ({
  readLocalApi: mockReadLocalApi,
}));

import {
  migrateLegacyStoredSidebarPinsToServer,
  persistStoredSidebarPins,
  readStoredSidebarPinsFromClientSettings,
  readStoredSidebarPinsFromServerSettings,
} from "~/t3work/hooks/t3work-sidebarPinPersistence";
import {
  buildGitHubActivitySidebarPinnedItem,
  buildTicketSidebarPinnedItem,
} from "~/t3work/t3work-sidebarPinningTypes";

describe("sidebar pin persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadLocalApi.mockReturnValue(null);
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
        t3workStoredSidebarPinsJson: JSON.stringify([jiraPin, githubPin]),
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
        t3workStoredSidebarPinsJson: JSON.stringify([jiraPin, githubPin]),
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
        t3workStoredSidebarPinsJson: JSON.stringify([original, replacement]),
      }),
    ).toEqual([replacement]);
  });

  it("migrates legacy client sidebar pins into server settings", async () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const setClientSettings = vi.fn().mockResolvedValue(undefined);

    mockReadLocalApi.mockReturnValue({
      persistence: {
        getClientSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_CLIENT_SETTINGS,
          t3workStoredSidebarPinsJson: JSON.stringify([jiraPin]),
        }),
        setClientSettings,
      },
      server: {
        getSettings: vi.fn().mockResolvedValue(DEFAULT_SERVER_SETTINGS),
        updateSettings,
      },
    });

    await expect(migrateLegacyStoredSidebarPinsToServer()).resolves.toEqual([jiraPin]);
    expect(updateSettings).toHaveBeenCalledWith({
      t3workStoredSidebarPinsJson: JSON.stringify([jiraPin]),
    });
    expect(setClientSettings).toHaveBeenCalledWith({
      ...DEFAULT_CLIENT_SETTINGS,
      t3workStoredSidebarPinsJson: "",
    });
  });

  it("persists sidebar pins through server settings", async () => {
    const jiraPin = buildTicketSidebarPinnedItem({
      projectId: "project-1",
      ticketId: "ticket-9",
      pinnedAt: "2026-05-23T12:00:00.000Z",
    });
    const updateSettings = vi.fn().mockResolvedValue(undefined);

    mockReadLocalApi.mockReturnValue({
      persistence: {},
      server: {
        updateSettings,
      },
    });

    persistStoredSidebarPins([jiraPin]);

    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        t3workStoredSidebarPinsJson: JSON.stringify([jiraPin]),
      });
    });
  });
});
