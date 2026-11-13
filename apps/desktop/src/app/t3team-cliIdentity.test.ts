import { describe, expect, it } from "vite-plus/test";

import { renderCliShim, type CliShimTarget } from "./DesktopCliShim.ts";
import {
  NEXI_MARKER,
  cliBinaryName,
  cliPathLinkName,
  cliShimMarker,
  isolatedShimEnvVars,
} from "./t3team-cliIdentity.ts";

describe("isolated Nexi CLI names", () => {
  it("uses nexi / nexi.cmd and a Nexi marker for an isolated instance", () => {
    expect(cliBinaryName({ isolatedInstance: true, platform: "darwin" })).toBe("nexi");
    expect(cliBinaryName({ isolatedInstance: true, platform: "linux" })).toBe("nexi");
    expect(cliBinaryName({ isolatedInstance: true, platform: "win32" })).toBe("nexi.cmd");
    expect(cliBinaryName({ isolatedInstance: false, platform: "linux" })).toBe("t3");
    expect(cliBinaryName({ isolatedInstance: false, platform: "win32" })).toBe("t3.cmd");
    expect(cliPathLinkName(true)).toBe("nexi");
    expect(cliPathLinkName(false)).toBe("t3");
    expect(cliShimMarker(true)).toBe(NEXI_MARKER);
    expect(cliShimMarker(false)).toBe("Written by T3 Code: runs the desktop app's bundled t3 CLI.");
  });

  it("lists isolated shim env vars and none otherwise", () => {
    expect(isolatedShimEnvVars({ isolatedInstance: false })).toEqual([]);
    expect(isolatedShimEnvVars({ isolatedInstance: true, appId: "ch.nexplore.nexi.work" })).toEqual(
      [
        { name: "T3CODE_DESKTOP_ISOLATED_INSTANCE", value: "1" },
        { name: "T3CODE_DESKTOP_APP_ID", value: "ch.nexplore.nexi.work" },
      ],
    );
  });

  it("renders a Nexi marker and identity env into the isolated shim", () => {
    const target: CliShimTarget = {
      kind: "direct",
      executable: "/opt/Nexi/nexi",
      entry: "/opt/Nexi/entry.mjs",
    };
    const shim = renderCliShim({
      target,
      shimPath: "/home/n/.nexi/bin/nexi",
      t3Home: "/home/n/.nexi",
      isolatedInstance: true,
      appId: "ch.nexplore.nexi.work",
    });
    expect(shim).toContain(NEXI_MARKER);
    expect(shim).toContain("export T3CODE_DESKTOP_ISOLATED_INSTANCE='1'");
    expect(shim).toMatch(/export T3CODE_DESKTOP_APP_ID=.ch\.nexplore\.nexi\.work./);
    expect(shim).not.toContain("T3_BOOT_SERVICE_UNIT=");
  });
});
