import { describe, expect, it } from "vite-plus/test";

import {
  isSidecarItemHidden,
  isSidecarItemPinned,
  resolveSidecarComposition,
  resolveSidecarSectionItemOrder,
  resolveSidecarSectionItemPersonalization,
} from "./sidecarComposition.js";

const BUNDLED_DEFAULT = {
  sections: [
    { sectionId: "quick-starts", visible: true, collapsed: false },
    { sectionId: "notes", visible: true, collapsed: false },
  ],
} as const;

describe("resolveSidecarComposition", () => {
  it("returns the bundled default order when no overrides are present", () => {
    expect(resolveSidecarComposition({ bundledDefault: BUNDLED_DEFAULT }).sections).toEqual([
      { sectionId: "quick-starts", visible: true, collapsed: false },
      { sectionId: "notes", visible: true, collapsed: false },
    ]);
  });

  it("respects profile ordering above the bundled default", () => {
    expect(
      resolveSidecarComposition({
        bundledDefault: BUNDLED_DEFAULT,
        profileDefault: {
          sections: [{ sectionId: "notes" }, { sectionId: "quick-starts" }],
        },
      }).sections.map((section) => section.sectionId),
    ).toEqual(["notes", "quick-starts"]);
  });

  it("drops hidden user-overridden sections and lets user collapse state beat profile state", () => {
    expect(
      resolveSidecarComposition({
        bundledDefault: BUNDLED_DEFAULT,
        profileDefault: {
          sections: [
            { sectionId: "notes", collapsed: false },
            { sectionId: "quick-starts", collapsed: false },
          ],
        },
        userOverrides: {
          sections: [
            { sectionId: "notes", collapsed: true },
            { sectionId: "quick-starts", visible: false },
          ],
        },
      }).sections,
    ).toEqual([{ sectionId: "notes", visible: true, collapsed: true }]);
  });

  it("reads section item personalization from the shared per-user payload", () => {
    expect(
      resolveSidecarSectionItemPersonalization({
        sectionId: "quick-starts",
        personalization: {
          composition: { sections: [] },
          itemHides: {
            "quick-starts": ["recipe-2"],
          },
          itemPins: {
            "quick-starts": ["recipe-3", "recipe-1"],
          },
          itemOrderOverrides: {
            "quick-starts": ["recipe-3", "recipe-2", "recipe-3"],
          },
        },
      }),
    ).toEqual({
      hiddenItemIds: ["recipe-2"],
      pinnedItemIds: ["recipe-3", "recipe-1"],
      orderOverrideItemIds: ["recipe-2", "recipe-3"],
    });
  });

  it("resolves hidden items out of the order and moves pinned items to the top", () => {
    const personalization = resolveSidecarSectionItemPersonalization({
      sectionId: "quick-starts",
      personalization: {
        composition: { sections: [] },
        itemHides: {
          "quick-starts": ["recipe-2"],
        },
        itemPins: {
          "quick-starts": ["recipe-3"],
        },
        itemOrderOverrides: {
          "quick-starts": ["recipe-4", "recipe-2"],
        },
      },
    });

    expect(
      resolveSidecarSectionItemOrder({
        itemIds: ["recipe-1", "recipe-2", "recipe-3", "recipe-4"],
        personalization,
      }),
    ).toEqual(["recipe-3", "recipe-4", "recipe-1"]);
    expect(isSidecarItemHidden({ itemId: "recipe-2", personalization })).toBe(true);
    expect(isSidecarItemHidden({ itemId: "recipe-1", personalization })).toBe(false);
    expect(isSidecarItemPinned({ itemId: "recipe-3", personalization })).toBe(true);
    expect(isSidecarItemPinned({ itemId: "recipe-4", personalization })).toBe(false);
  });
});
