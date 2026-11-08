import { assert, describe, it } from "vite-plus/test";

import { resolveMacLauncherIconPaths } from "./electron-launcher.mjs";

describe("electron launcher distribution icon", () => {
  it("falls back to the canonical development and production assets", () => {
    const previous = process.env.T3CODE_DESKTOP_ICON_PNG;
    delete process.env.T3CODE_DESKTOP_ICON_PNG;
    try {
      const development = resolveMacLauncherIconPaths("/runtime", true);
      const production = resolveMacLauncherIconPaths("/runtime", false);

      assert.match(development.sourceIconPath, /assets[\\/]dev[\\/]blueprint-macos-1024\.png$/);
      assert.match(production.sourceIconPath, /assets[\\/]prod[\\/]black-macos-1024\.png$/);
    } finally {
      if (previous !== undefined) process.env.T3CODE_DESKTOP_ICON_PNG = previous;
    }
  });

  it("lets T3CODE_DESKTOP_ICON_PNG override the launcher icon source", () => {
    const previous = process.env.T3CODE_DESKTOP_ICON_PNG;
    process.env.T3CODE_DESKTOP_ICON_PNG = "/distro/packs/assets/mark-1024.png";
    try {
      const development = resolveMacLauncherIconPaths("/runtime", true);
      const production = resolveMacLauncherIconPaths("/runtime", false);

      assert.equal(development.sourceIconPath, "/distro/packs/assets/mark-1024.png");
      assert.equal(production.sourceIconPath, "/distro/packs/assets/mark-1024.png");
      // The cache stays keyed per stage so both keep their generated names.
      assert.equal(development.generatedIconPath, "/runtime/icon-dev.icns");
      assert.equal(production.generatedIconPath, "/runtime/icon-prod.icns");
    } finally {
      if (previous !== undefined) process.env.T3CODE_DESKTOP_ICON_PNG = previous;
      else delete process.env.T3CODE_DESKTOP_ICON_PNG;
    }
  });
});
