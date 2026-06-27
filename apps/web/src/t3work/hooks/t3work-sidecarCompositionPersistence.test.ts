import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

const { mockReadLocalApi } = vi.hoisted(() => ({
  mockReadLocalApi: vi.fn(),
}));

vi.mock("~/localApi", () => ({
  readLocalApi: mockReadLocalApi,
}));

import {
  persistStoredSidecarPersonalization,
  readStoredSidecarPersonalizationFromClientSettings,
  readStoredSidecarPersonalizationFromServerSettings,
  persistStoredSidecarComposition,
  readStoredSidecarCompositionFromClientSettings,
  readStoredSidecarCompositionFromServerSettings,
} from "~/t3work/hooks/t3work-sidecarCompositionPersistence";

describe("sidecar composition persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadLocalApi.mockReturnValue(null);
  });

  it("reads persisted sidecar composition from server settings", () => {
    expect(
      readStoredSidecarCompositionFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [
              { sectionId: "quick-starts", collapsed: false },
              { sectionId: "recent-conversations", collapsed: true },
            ],
          },
        }),
      }),
    ).toEqual({
      sections: [
        { sectionId: "quick-starts", collapsed: false },
        { sectionId: "recent-conversations", collapsed: true },
      ],
    });
  });

  it("reads persisted sidecar composition from client settings", () => {
    expect(
      readStoredSidecarCompositionFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [{ sectionId: "quick-starts", visible: true, collapsed: true }],
          },
        }),
      }),
    ).toEqual({
      sections: [{ sectionId: "quick-starts", visible: true, collapsed: true }],
    });
  });

  it("dedupes persisted sidecar sections by id and keeps the latest payload", () => {
    expect(
      readStoredSidecarCompositionFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [
              { sectionId: "quick-starts", collapsed: false },
              { sectionId: "quick-starts", collapsed: true },
            ],
          },
        }),
      }),
    ).toEqual({
      sections: [{ sectionId: "quick-starts", collapsed: true }],
    });
  });

  it("falls back to the legacy direct-composition payload", () => {
    expect(
      readStoredSidecarPersonalizationFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3workStoredSidecarCompositionJson: JSON.stringify({
          sections: [{ sectionId: "quick-starts", collapsed: true }],
        }),
      }),
    ).toEqual({
      composition: {
        sections: [{ sectionId: "quick-starts", collapsed: true }],
      },
    });
  });

  it("round-trips item personalization fields through the shared settings key", async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);

    mockReadLocalApi.mockReturnValue({
      persistence: {},
      server: {
        updateSettings,
      },
    });

    persistStoredSidecarPersonalization({
      composition: {
        sections: [{ sectionId: "quick-starts", collapsed: true }],
      },
      itemHides: {
        "quick-starts": ["recipe-2"],
      },
      itemPins: {
        "quick-starts": ["recipe-3"],
      },
      itemOrderOverrides: {
        "quick-starts": ["recipe-4", "recipe-3"],
      },
    });

    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        t3workStoredSidecarCompositionJson:
          '{"composition":{"sections":[{"sectionId":"quick-starts","collapsed":true}]},"itemHides":{"quick-starts":["recipe-2"]},"itemPins":{"quick-starts":["recipe-3"]},"itemOrderOverrides":{"quick-starts":["recipe-4","recipe-3"]}}',
      });
    });

    expect(
      readStoredSidecarPersonalizationFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3workStoredSidecarCompositionJson:
          updateSettings.mock.calls[0]?.[0]?.t3workStoredSidecarCompositionJson,
      }),
    ).toEqual({
      composition: {
        sections: [{ sectionId: "quick-starts", collapsed: true }],
      },
      itemHides: {
        "quick-starts": ["recipe-2"],
      },
      itemPins: {
        "quick-starts": ["recipe-3"],
      },
      itemOrderOverrides: {
        "quick-starts": ["recipe-4", "recipe-3"],
      },
    });
  });

  it("round-trips persisted sidecar composition through the server settings seam", async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);

    mockReadLocalApi.mockReturnValue({
      persistence: {},
      server: {
        updateSettings,
      },
    });

    persistStoredSidecarComposition({
      sections: [
        { sectionId: "quick-starts", collapsed: true },
        { sectionId: "recent-conversations", visible: false },
      ],
    });

    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        t3workStoredSidecarCompositionJson:
          '{"composition":{"sections":[{"sectionId":"quick-starts","collapsed":true},{"sectionId":"recent-conversations","visible":false}]}}',
      });
    });

    expect(
      readStoredSidecarCompositionFromServerSettings({
        ...DEFAULT_SERVER_SETTINGS,
        t3workStoredSidecarCompositionJson:
          updateSettings.mock.calls[0]?.[0]?.t3workStoredSidecarCompositionJson,
      }),
    ).toEqual({
      sections: [
        { sectionId: "quick-starts", collapsed: true },
        { sectionId: "recent-conversations", visible: false },
      ],
    });
  });
});
