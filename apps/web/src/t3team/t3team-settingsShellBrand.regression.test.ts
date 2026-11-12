// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard: the Settings shell must brand itself from the pack,
 * like the thread sidebar, not with upstream's hard-wired "T3 Code" wordmark.
 *
 * Settings used to render its own sidebar header on `/settings`, and upstream's
 * `SidebarChromeHeader` there spells "T3" + "Code" literally, so a Nexi Work
 * build showed "T3 Code" as soon as the user opened Settings. Settings is now a modal
 * (`AppRouteModal`) over the main app shell, so the only sidebar header on screen is the main
 * sidebar's, and the Team header (`InboxHeader` -> `ProjectSidebarHeader`, fed by the pack's
 * `labels.appName`) is the one branding source the rest of the chrome uses. Upstream syncs
 * rewrite these files, which is why the wiring is pinned here.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const read = (relative: string) =>
  NodeFS.readFileSync(NodePath.resolve(import.meta.dirname, relative), "utf8");

describe("Settings shell branding regression guard", () => {
  it("renders the Team header in the sidebar that stays visible under the settings modal", () => {
    expect(read("../components/AppSidebarLayout.tsx")).toMatch(/<ThreadSidebar\b/);
    expect(read("../components/Sidebar.tsx")).toMatch(/<InboxHeader \/>/);
  });

  it("opens settings as a modal over the shell instead of with a header of its own", () => {
    const settings = read("../routes/_chat.settings.tsx");
    expect(settings).toMatch(/<AppRouteModal label="Settings">/);
    expect(settings).not.toMatch(/<InboxHeader\b|<SidebarChromeHeader\b|<T3Wordmark\b/);
  });

  it("no longer renders upstream's T3 Code chrome header anywhere in the shell", () => {
    expect(read("../components/AppSidebarLayout.tsx")).not.toMatch(/<SidebarChromeHeader\b/);
    expect(read("../components/Sidebar.tsx")).not.toMatch(/<SidebarChromeHeader\b/);
    expect(read("../components/settings/SettingsSidebarNav.tsx")).not.toMatch(
      /<SidebarChromeHeader\b/,
    );
  });
});
