import { describe, expect, it } from "vite-plus/test";

import { resolvePackAppName } from "./t3team-packAppName";

describe("resolvePackAppName", () => {
  it("prefers the appearance label over the theme product name", () => {
    expect(
      resolvePackAppName(
        { labels: { appName: "Pack Label" }, productName: "Pack Product" },
        "T3 Code",
      ),
    ).toBe("Pack Label");
  });

  it("uses the theme product name when the appearance label is absent", () => {
    expect(resolvePackAppName({ productName: "Pack Product" }, "T3 Code")).toBe("Pack Product");
  });

  it("keeps the vendor name when no distribution names the product", () => {
    expect(resolvePackAppName(undefined, "T3 Code")).toBe("T3 Code");
    expect(resolvePackAppName({ labels: { appName: "  " }, productName: "" }, "T3 Code")).toBe(
      "T3 Code",
    );
  });
});
