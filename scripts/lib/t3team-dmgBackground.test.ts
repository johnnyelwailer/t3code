import { assert, describe, it } from "@effect/vitest";

import { resolveDmgBackgroundOverride } from "./t3team-dmgBackground.ts";

describe("resolveDmgBackgroundOverride", () => {
  it("prefers the explicit path, then a distribution file", () => {
    assert.equal(
      resolveDmgBackgroundOverride({
        env: {
          T3CODE_DESKTOP_DMG_BACKGROUND: "/distro/explicit.svg",
          T3CODE_DISTRIBUTION: "/distro",
        },
        channel: "latest",
        readFile: () => '{"branding":{"dmgBackground":"assets/dmg.svg"}}',
      }),
      "/distro/explicit.svg",
    );
  });

  it("resolves a shared distribution background and a per-channel one", () => {
    const shared = resolveDmgBackgroundOverride({
      env: { T3CODE_DISTRIBUTION: "/distro" },
      channel: "nightly",
      readFile: (filePath) =>
        filePath.endsWith("distribution.json")
          ? JSON.stringify({ branding: { dmgBackground: "assets/dmg.svg" } })
          : undefined,
    });
    assert.equal(shared, "/distro/assets/dmg.svg");

    const nightly = resolveDmgBackgroundOverride({
      env: { T3CODE_DISTRIBUTION: "/distro" },
      channel: "nightly",
      readFile: () =>
        JSON.stringify({
          branding: {
            dmgBackground: { latest: "assets/latest.svg", nightly: "assets/nightly.svg" },
          },
        }),
    });
    assert.equal(nightly, "/distro/assets/nightly.svg");
  });

  it("leaves the vendor background in place when no distribution declares one", () => {
    assert.equal(
      resolveDmgBackgroundOverride({
        env: {},
        channel: "latest",
        readFile: () => undefined,
      }),
      undefined,
    );
    assert.equal(
      resolveDmgBackgroundOverride({
        env: { T3CODE_DISTRIBUTION: "/distro" },
        channel: "latest",
        readFile: () => JSON.stringify({ branding: { productName: "Pack Product" } }),
      }),
      undefined,
    );
  });
});
