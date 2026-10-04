// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard: the Settings shell must brand itself from the pack,
 * like the thread sidebar, not with upstream's hard-wired "T3 Code" wordmark.
 *
 * `AppSidebarLayout` renders its own sidebar header on `/settings`. Upstream's
 * `SidebarChromeHeader` there spells "T3" + "Code" literally, so a Nexi Work
 * build showed "T3 Code" as soon as the user opened Settings. The fix renders
 * the Team header (`InboxHeader` → `ProjectSidebarHeader`, fed by the pack's
 * `labels.appName`), the one branding source the rest of the chrome uses.
 * Upstream syncs rewrite this file, which is why the wiring is pinned here.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const LAYOUT_PATH = NodePath.resolve(import.meta.dirname, "../components/AppSidebarLayout.tsx");

describe("Settings shell branding regression guard", () => {
  const source = NodeFS.readFileSync(LAYOUT_PATH, "utf8");

  it("renders the Team header on the settings branch", () => {
    expect(source).toMatch(/isOnSettings \? \([\s\S]*?<InboxHeader \/>[\s\S]*?<SettingsSidebarNav/);
  });

  it("no longer renders upstream's T3 Code chrome header", () => {
    expect(source).not.toMatch(/<SidebarChromeHeader\b/);
  });
});
