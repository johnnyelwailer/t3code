import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { MessageCircle } from "lucide-react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, type Screen } from "../../test/render";

vi.mock(import("~/hooks/useTheme"), async (original) => ({
  ...(await original()),
  useTheme: () => ({ theme: "light", resolvedTheme: "light", themeHalves: null }) as never,
}));
vi.mock(import("~/browser/browserDefaults"), async (original) => ({
  ...(await original()),
  useBrowserDefaults: () => ({ profiles: [] }) as never,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useThreadShells: () => [] as never,
}));

import { RightPanelTabs, type RightPanelTabsProps } from "./RightPanelTabs";

const filesSurface = { id: "files" as const, kind: "files" as const };
const diffSurface = { id: "diff" as const, kind: "diff" as const };
const noop = () => undefined;

const SHORTCUT_CONTEXT = {
  terminalFocus: false,
  terminalOpen: false,
  previewFocus: false,
  previewOpen: false,
  isWeb: true,
  isDesktop: false,
};

function tabs(overrides: Partial<RightPanelTabsProps> & { activeSurfaceId: string | null }) {
  return (
    <RightPanelTabs
      mode="inline"
      open
      keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
      getShortcutContext={() => SHORTCUT_CONTEXT}
      surfaces={[filesSurface, diffSurface]}
      environmentId={null}
      pendingSurfaceIds={new Set()}
      previewSessions={{}}
      desktopByTabId={{}}
      terminalLabelsById={new Map()}
      onActivate={noop}
      onCloseSurface={noop}
      onCloseOtherSurfaces={noop}
      onCloseSurfacesToRight={noop}
      onCloseAllSurfaces={noop}
      onCopyFilePath={noop}
      onAddBrowser={noop}
      onAddBrowserInProfile={noop}
      onAddTerminal={noop}
      onAddPullRequest={noop}
      onAddPullRequests={noop}
      onAddDiff={noop}
      onAddFiles={noop}
      onAddDevice={noop}
      browserAvailable
      terminalAvailable={false}
      diffAvailable
      filesAvailable
      pullRequestAvailable={false}
      pullRequestsAvailable={false}
      deviceAvailable={false}
      emptyState={<div data-testid="chat-body">chat body</div>}
      {...overrides}
    >
      <div data-testid="surface-body">surface body</div>
    </RightPanelTabs>
  );
}

const pinnedButton = (screen: Screen) =>
  screen.container.querySelector<HTMLButtonElement>("[data-pinned-tab]");
const tabList = (screen: Screen) => screen.container.querySelector("[data-right-panel-tab-list]");
const surfaceTabs = (screen: Screen) => [...screen.container.querySelectorAll("[data-active-tab]")];

describe("RightPanelTabs pinnedTab", () => {
  const onActivate = vi.fn();
  const pinnedTab = { label: "Chat", icon: MessageCircle, onActivate };

  it("renders nothing extra without the prop", async () => {
    await using screen = await render(tabs({ activeSurfaceId: "files" }), { router: false });

    expect(pinnedButton(screen)).toBeNull();
    expect(screen.container.querySelector("[aria-label='Close Chat']")).toBeNull();
  });

  it("is the first tab and active while no surface is, with its body in the empty state", async () => {
    await using screen = await render(tabs({ activeSurfaceId: null, pinnedTab }), {
      router: false,
    });

    expect(pinnedButton(screen)?.textContent).toBe("Chat");
    expect(pinnedButton(screen)?.dataset.activeTab).toBe("true");
    expect(screen.container.querySelector("[data-testid=chat-body]")).not.toBeNull();
    expect(screen.container.querySelector("[data-testid=surface-body]")).toBeNull();
    const first = tabList(screen)?.querySelector("[data-active-tab]");
    expect(first).toBe(pinnedButton(screen));
  });

  it("has no close button and sits outside the sortable surface list", async () => {
    await using screen = await render(tabs({ activeSurfaceId: null, pinnedTab }), {
      router: false,
    });

    expect(pinnedButton(screen)?.querySelector("button")).toBeNull();
    expect(screen.container.querySelector("[aria-label^='Close Chat']")).toBeNull();
    expect(screen.container.querySelectorAll("[aria-label^='Close ']").length).toBe(2);
    expect(pinnedButton(screen)?.getAttribute("style")).toBeNull();
    expect(pinnedButton(screen)?.getAttribute("aria-roledescription")).toBeNull();
  });

  it("leaves other tabs unaffected: inactive while pinned, active when selected", async () => {
    await using screen = await render(tabs({ activeSurfaceId: null, pinnedTab }), {
      router: false,
    });
    expect(surfaceTabs(screen).map((tab) => tab.getAttribute("data-active-tab"))).toEqual([
      "true",
      "false",
      "false",
    ]);

    await screen.rerender(tabs({ activeSurfaceId: "diff", pinnedTab }));
    expect(pinnedButton(screen)?.dataset.activeTab).toBe("false");
    expect(surfaceTabs(screen).map((tab) => tab.getAttribute("data-active-tab"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(screen.container.querySelector("[data-testid=surface-body]")).not.toBeNull();
  });

  it("calls onActivate on click and onActivate of surfaces still reports the surface", async () => {
    const onSurfaceActivate = vi.fn();
    await using screen = await render(
      tabs({ activeSurfaceId: "files", pinnedTab, onActivate: onSurfaceActivate }),
      { router: false },
    );

    await act(async () => pinnedButton(screen)?.click());
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onSurfaceActivate).not.toHaveBeenCalled();
  });

  it("does not let the closed tab list change when every surface is closed", async () => {
    await using screen = await render(tabs({ activeSurfaceId: null, pinnedTab, surfaces: [] }), {
      router: false,
    });

    expect(pinnedButton(screen)).not.toBeNull();
    expect(surfaceTabs(screen)).toEqual([pinnedButton(screen)]);
  });
});
