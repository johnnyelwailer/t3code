import { describe, expect, it } from "vite-plus/test";

import { t3teamAppDisplayName, t3teamPackProductName } from "./t3team-appBrandName";

describe("t3teamPackProductName", () => {
  it("prefers the pack label, then the distribution product name", () => {
    expect(
      t3teamPackProductName({
        labels: { appName: "Pack Label" },
        productName: "Pack Product",
      }),
    ).toBe("Pack Label");
    expect(t3teamPackProductName({ productName: "Pack Product" })).toBe("Pack Product");
    expect(t3teamPackProductName({ labels: { appName: "  " }, productName: "  " })).toBeUndefined();
    expect(t3teamPackProductName(undefined)).toBeUndefined();
  });

  it("keeps the vendor display name when no distribution is active", () => {
    expect(t3teamAppDisplayName(undefined)).toMatch(/^T3 Code/);
    expect(t3teamAppDisplayName({ labels: { appName: "Pack Label" } })).toMatch(/^Pack Label/);
  });
});
