import type { PreviewSessionSnapshot } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const threadShellState = vi.hoisted(() => ({
  shells: [] as Array<{ id: string; title: string }>,
}));

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
  useThreadShells: () => threadShellState.shells as never,
}));

import { RightPanelTabs } from "./RightPanelTabs";

const previewSurface = {
  id: "browser:tab-1" as const,
  kind: "preview" as const,
  resourceId: "tab-1",
};
const threadSurface = {
  id: "thread:thread-C" as const,
  kind: "thread" as const,
  threadId: "thread-C",
  environmentId: "env-1",
};
const sessions: Readonly<Record<string, PreviewSessionSnapshot>> = {
  "tab-1": {
    threadId: "thread-1",
    tabId: "tab-1",
    navStatus: { _tag: "Success", url: "http://24x.xf.local/", title: "Local site" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
};

let root: Root;
let container: HTMLDivElement;
const noop = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  threadShellState.shells = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderThreadTab() {
  await act(() =>
    root.render(
      <RightPanelTabs
        mode="inline"
        open
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        getShortcutContext={() => ({
          terminalFocus: false,
          terminalOpen: false,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        })}
        surfaces={[previewSurface, threadSurface]}
        environmentId={null}
        activeSurfaceId={threadSurface.id}
        pendingSurfaceIds={new Set()}
        previewSessions={sessions}
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
        diffAvailable={false}
        filesAvailable={false}
        pullRequestAvailable={false}
        pullRequestsAvailable={false}
        deviceAvailable={false}
      >
        <div>content</div>
      </RightPanelTabs>,
    ),
  );
  return container.textContent ?? "";
}

describe("side chat (thread) tabs", () => {
  it("labels a thread tab from the thread shell's title", async () => {
    threadShellState.shells = [
      { id: "thread-C", title: "Accessibility review" },
      { id: "thread-A", title: "Unrelated thread" },
    ];
    const text = await renderThreadTab();

    expect(text).toContain("Accessibility review");
    expect(text).not.toContain("Unrelated thread");
  });

  it("falls back to 'Thread' while the shell is not projected yet", async () => {
    const text = await renderThreadTab();

    expect(text).toContain("Thread");
    expect(text).not.toContain("Accessibility review");
  });

  it("renders a thread surface alongside browser tabs without clobbering them", async () => {
    threadShellState.shells = [{ id: "thread-C", title: "Accessibility review" }];
    const text = await renderThreadTab();

    expect(text).toContain("Local site");
    expect(text).toContain("Accessibility review");
  });
});
