import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resolveSidecarComposition, type SidecarComposition } from "@t3tools/project-recipes";

const { mockPersistStoredSidecarPersonalization, mockUseServerConfig } = vi.hoisted(() => ({
  mockPersistStoredSidecarPersonalization: vi.fn(),
  mockUseServerConfig: vi.fn(),
}));

vi.mock("~/rpc/serverState", () => ({
  useServerConfig: mockUseServerConfig,
}));

vi.mock("~/t3work/hooks/t3work-sidecarCompositionPersistence", () => ({
  persistStoredSidecarPersonalization: mockPersistStoredSidecarPersonalization,
  readStoredSidecarPersonalizationFromServerSettings: (settings: {
    t3workStoredSidecarCompositionJson?: string;
  }) => {
    const raw = settings?.t3workStoredSidecarCompositionJson;
    return raw ? JSON.parse(raw) : {};
  },
}));

import { useT3workSidecarComposition } from "~/t3work/hooks/t3work-useSidecarComposition";

const BUNDLED_DEFAULT: SidecarComposition = {
  sections: [
    { sectionId: "quick-starts", visible: true, collapsed: false },
    { sectionId: "recent-conversations", visible: true, collapsed: false },
  ],
};

type SidecarCompositionHookValue = ReturnType<typeof useT3workSidecarComposition>;

function renderHookValue(): SidecarCompositionHookValue {
  let captured: SidecarCompositionHookValue | undefined;

  function Probe() {
    captured = useT3workSidecarComposition({ bundledDefault: BUNDLED_DEFAULT });
    return null;
  }

  renderToStaticMarkup(<Probe />);
  if (!captured) {
    throw new Error("Expected hook value to be captured.");
  }

  return captured;
}

describe("useT3workSidecarComposition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseServerConfig.mockReturnValue({
      settings: {
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [
              { sectionId: "quick-starts", visible: true, collapsed: false },
              { sectionId: "recent-conversations", visible: true, collapsed: false },
            ],
          },
        }),
      },
    });
  });

  it("hides a section by persisting visible:false into the resolved composition layer", () => {
    const hookValue = renderHookValue();

    hookValue.hideSection("recent-conversations");

    expect(mockPersistStoredSidecarPersonalization).toHaveBeenCalledWith({
      composition: {
        sections: [
          { sectionId: "quick-starts", visible: true, collapsed: false },
          { sectionId: "recent-conversations", visible: false, collapsed: false },
        ],
      },
    });

    expect(
      resolveSidecarComposition({
        bundledDefault: BUNDLED_DEFAULT,
        userOverrides: mockPersistStoredSidecarPersonalization.mock.calls[0]?.[0]?.composition,
      }).sections.map((section) => section.sectionId),
    ).toEqual(["quick-starts"]);
  });

  it("moves a section up by persisting the reordered full composition", () => {
    const hookValue = renderHookValue();

    hookValue.moveSection("recent-conversations", "up");

    expect(mockPersistStoredSidecarPersonalization).toHaveBeenCalledWith({
      composition: {
        sections: [
          { sectionId: "recent-conversations", visible: true, collapsed: false },
          { sectionId: "quick-starts", visible: true, collapsed: false },
        ],
      },
    });

    expect(
      resolveSidecarComposition({
        bundledDefault: BUNDLED_DEFAULT,
        userOverrides: mockPersistStoredSidecarPersonalization.mock.calls[0]?.[0]?.composition,
      }).sections.map((section) => section.sectionId),
    ).toEqual(["recent-conversations", "quick-starts"]);
  });

  it("persists hide, pin, and unpin item writers in the shared personalization payload", () => {
    const hookValue = renderHookValue();

    hookValue.hideItem("quick-starts", "recipe-2");
    expect(mockPersistStoredSidecarPersonalization).toHaveBeenLastCalledWith({
      itemHides: {
        "quick-starts": ["recipe-2"],
      },
      itemPins: undefined,
    });

    mockUseServerConfig.mockReturnValue({
      settings: {
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [
              { sectionId: "quick-starts", visible: true, collapsed: false },
              { sectionId: "recent-conversations", visible: true, collapsed: false },
            ],
          },
          itemHides: {
            "quick-starts": ["recipe-2"],
          },
        }),
      },
    });

    const pinnedHookValue = renderHookValue();
    pinnedHookValue.pinItem("quick-starts", "recipe-3");
    expect(mockPersistStoredSidecarPersonalization).toHaveBeenLastCalledWith({
      itemHides: undefined,
      itemPins: {
        "quick-starts": ["recipe-3"],
      },
    });

    mockUseServerConfig.mockReturnValue({
      settings: {
        t3workStoredSidecarCompositionJson: JSON.stringify({
          composition: {
            sections: [
              { sectionId: "quick-starts", visible: true, collapsed: false },
              { sectionId: "recent-conversations", visible: true, collapsed: false },
            ],
          },
          itemPins: {
            "quick-starts": ["recipe-3"],
          },
        }),
      },
    });

    const unpinnedHookValue = renderHookValue();
    unpinnedHookValue.unpinItem("quick-starts", "recipe-3");
    expect(mockPersistStoredSidecarPersonalization).toHaveBeenLastCalledWith({
      itemPins: undefined,
    });
  });
});
