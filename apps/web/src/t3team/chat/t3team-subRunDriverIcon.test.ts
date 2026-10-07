import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { subRunDriverShowsGlyph, type SubRunDriver } from "./t3team-subRunDriverIcon";

function driver(patch: Partial<SubRunDriver> & Pick<SubRunDriver, "driverKind">): SubRunDriver {
  return { displayName: patch.driverKind, ...patch };
}

describe("subRunDriverShowsGlyph", () => {
  it("uses built-in glyphs for the first-party drivers", () => {
    for (const driverKind of [
      "codex",
      "claudeAgent",
      "cursor",
      "grok",
      "opencode",
      "antigravity",
      "pi",
    ]) {
      expect(
        subRunDriverShowsGlyph(driver({ driverKind: ProviderDriverKind.make(driverKind) })),
      ).toBe(true);
    }
  });

  it("draws Nexplore only from a pack icon or an ACP registry icon", () => {
    const nexplore = ProviderDriverKind.make("nexplore");
    expect(subRunDriverShowsGlyph(driver({ driverKind: nexplore, displayName: "Nexplore" }))).toBe(
      false,
    );
    expect(
      subRunDriverShowsGlyph(
        driver({
          driverKind: nexplore,
          displayName: "Nexplore",
          iconDataUrl: "data:image/png,abc",
        }),
      ),
    ).toBe(true);
    expect(
      subRunDriverShowsGlyph(
        driver({
          driverKind: nexplore,
          displayName: "Nexplore",
          acpRegistryIconUrl: "https://cdn.example/icon.svg",
        }),
      ),
    ).toBe(true);
  });

  it("falls back for any other driver that has no pack or registry icon", () => {
    expect(subRunDriverShowsGlyph(driver({ driverKind: ProviderDriverKind.make("custom") }))).toBe(
      false,
    );
    expect(subRunDriverShowsGlyph(null)).toBe(false);
  });
});
