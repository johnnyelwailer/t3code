import { describe, expect, it } from "vite-plus/test";

import { topOfPinnedOrderKey } from "./t3team-voicePinOrder";

function isAboveAll(key: string | null, keys: readonly string[]): boolean {
  return typeof key === "string" && keys.every((existing) => key < existing);
}

describe("topOfPinnedOrderKey", () => {
  it("returns an order key when nothing is pinned", () => {
    expect(topOfPinnedOrderKey([])).toBeTypeOf("string");
  });

  it("returns a key that sorts above every existing pinned key", () => {
    const key = topOfPinnedOrderKey([
      { pinnedAt: "2026-01-01T00:00:00Z", pinOrderKey: "n" },
      { pinnedAt: "2026-01-02T00:00:00Z", pinOrderKey: "d" },
    ]);
    expect(isAboveAll(key, ["n", "d"])).toBe(true);
  });

  it("sorts above the single smallest valid key", () => {
    const key = topOfPinnedOrderKey([{ pinnedAt: "2026-01-01T00:00:00Z", pinOrderKey: "b" }]);
    expect(isAboveAll(key, ["b"])).toBe(true);
  });

  it("ignores threads that are not pinned or have no order key", () => {
    expect(
      topOfPinnedOrderKey([
        { pinnedAt: null, pinOrderKey: "b" },
        { pinnedAt: "2026-01-01T00:00:00Z", pinOrderKey: null },
      ]),
    ).toBeTypeOf("string");
  });
});
