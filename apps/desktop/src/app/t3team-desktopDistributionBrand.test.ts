import { assert, describe, it } from "@effect/vitest";

import {
  applyDistributionProductName,
  distributionProductNameFromManifest,
  readDistributionProductName,
  resolveDesktopWindowTitle,
} from "./t3team-desktopDistributionBrand.ts";

describe("distribution desktop brand", () => {
  it("reads branding.productName ahead of the theme label", () => {
    assert.equal(
      distributionProductNameFromManifest({
        manifest: { branding: { productName: "Pack Product" } },
        theme: { labels: { appName: "Pack Label" }, productName: "Theme Product" },
      }),
      "Pack Product",
    );
    assert.equal(
      distributionProductNameFromManifest({
        manifest: {},
        theme: { labels: { appName: "Pack Label" } },
      }),
      "Pack Label",
    );
    assert.equal(
      distributionProductNameFromManifest({
        manifest: {},
        theme: { productName: "Theme Product" },
      }),
      "Theme Product",
    );
    assert.equal(distributionProductNameFromManifest({ manifest: {}, theme: {} }), undefined);
  });

  it("loads the theme named by the distribution manifest", () => {
    const files = new Map<string, string>([
      ["/distro/distribution.json", JSON.stringify({ theme: "theme/pack.json" })],
      ["/distro/theme/pack.json", JSON.stringify({ labels: { appName: "Pack Label" } })],
    ]);
    assert.equal(
      readDistributionProductName({ T3CODE_DISTRIBUTION: "/distro" }, (filePath) =>
        files.get(filePath),
      ),
      "Pack Label",
    );
    assert.equal(
      readDistributionProductName({}, () => "{}"),
      undefined,
    );
  });

  it("uses the product name as the window title and keeps the vendor stage suffix", () => {
    assert.deepEqual(
      applyDistributionProductName(
        { baseName: "T3 Code", stageLabel: "Dev", displayName: "T3 Code (Dev)" },
        "Pack Product",
      ),
      { baseName: "Pack Product", stageLabel: "Dev", displayName: "Pack Product (Dev)" },
    );
  });

  it("keeps a distribution window title when the boot document title is still the vendor name", () => {
    assert.equal(
      resolveDesktopWindowTitle({
        displayName: "Pack Product (Dev)",
        documentTitle: "T3 Code (Alpha)",
      }),
      "Pack Product (Dev)",
    );
    assert.equal(
      resolveDesktopWindowTitle({
        displayName: "T3 Code (Dev)",
        documentTitle: "Pack Product (Alpha)",
      }),
      "Pack Product (Alpha)",
    );
    assert.equal(
      resolveDesktopWindowTitle({
        displayName: "Pack Product (Dev)",
        documentTitle: "Pack Product",
      }),
      "Pack Product (Dev)",
    );
    assert.equal(
      resolveDesktopWindowTitle({ displayName: "T3 Code (Dev)", documentTitle: undefined }),
      "T3 Code (Dev)",
    );
  });
});
