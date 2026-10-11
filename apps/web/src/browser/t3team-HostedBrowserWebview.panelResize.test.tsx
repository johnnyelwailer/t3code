import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ThreadId,
  type ClientSettings,
  type DesktopPreviewBridge,
  type PreviewViewportSetting,
} from "@t3tools/contracts";
import { act, type ReactElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
  createTab: vi.fn<DesktopPreviewBridge["createTab"]>(),
  closeTab: vi.fn<DesktopPreviewBridge["closeTab"]>(),
  registerWebview: vi.fn<DesktopPreviewBridge["registerWebview"]>(),
  getPreviewConfig: vi.fn<DesktopPreviewBridge["getPreviewConfig"]>(),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ persistence: mocks }),
}));

vi.mock("~/components/preview/previewBridge", () => ({
  previewBridge: {
    createTab: mocks.createTab,
    closeTab: mocks.closeTab,
    registerWebview: mocks.registerWebview,
    getPreviewConfig: mocks.getPreviewConfig,
  },
}));

vi.mock("~/components/preview/usePreviewBridge", () => ({
  usePreviewBridge: () => undefined,
}));

// These controls' tooltips need a real DOM; the drag state under test arrives via `inlineSize`
// and the webview's own transform, neither of which they render.
vi.mock("~/components/preview/RightPanelResizeHandle", () => ({
  RightPanelResizeHandle: () => null,
}));

vi.mock("./BrowserDeviceToolbar", () => ({
  BrowserDeviceToolbar: () => null,
}));

vi.mock("./browserRecording", () => ({
  useActiveBrowserRecordingTabIds: () => new Set<string>(),
  stopBrowserRecording: async () => null,
}));

import { PreviewPanelShell } from "~/components/preview/PreviewPanelShell";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import {
  __resetClientSettingsPersistenceForTests,
  ensureClientSettingsHydrated,
} from "~/hooks/useSettings";
import { acquireBrowserSurface, useBrowserSurfaceStore } from "./browserSurfaceStore";
import { HostedBrowserWebview } from "./HostedBrowserWebview";

const RUNTIME_TAB_ID = "panel-resize-tab";
// A desktop-sized device viewport in a narrow panel: fit-to-panel scales it down.
const VIEWPORT: PreviewViewportSetting = { _tag: "freeform", width: 1440, height: 900 };
const noop = () => undefined;
const handlers: ResizableWidthHandlers = {
  onPointerDown: noop,
  onPointerMove: noop,
  onPointerUp: noop,
  onPointerCancel: noop,
  onLostPointerCapture: noop,
};

let renderer: ReactTestRenderer | undefined;

function Surface({
  resizing,
  otherPanelResizing = false,
}: {
  resizing: boolean;
  otherPanelResizing?: boolean;
}) {
  return (
    <>
      <PreviewPanelShell mode="inline" inlineSize={{ width: 600, handlers, resizing }}>
        {null}
      </PreviewPanelShell>
      <PreviewPanelShell
        mode="inline"
        inlineSize={{ width: 600, handlers, resizing: otherPanelResizing }}
      >
        {null}
      </PreviewPanelShell>
      <HostedBrowserWebview
        threadRef={{
          environmentId: EnvironmentId.make("host-panel-resize"),
          threadId: ThreadId.make("thread-panel-resize"),
        }}
        tabId="server-tab"
        runtimeTabId={RUNTIME_TAB_ID}
        initialUrl="https://example.com"
        viewport={VIEWPORT}
        pictureInPicture={false}
        profileId="work"
        zoomFactor={1}
      />
    </>
  );
}

function renderSurface(element: ReactElement) {
  return act(() => {
    renderer = create(element, {
      createNodeMock: (node) =>
        node.type === "webview"
          ? Object.assign(new EventTarget(), { getWebContentsId: () => 41 })
          : { scrollLeft: 0, scrollTop: 0, scrollTo: noop },
    });
  });
}

function webviewStyle() {
  const style = renderer!.root.findByType("webview").props.style as {
    left: number;
    transform: string | undefined;
  };
  return { left: style.left, transform: style.transform };
}

beforeEach(async () => {
  __resetClientSettingsPersistenceForTests();
  useBrowserSurfaceStore.setState({ activityByTabId: {}, byTabId: {} });
  mocks.getClientSettings.mockReset().mockResolvedValue({
    ...DEFAULT_CLIENT_SETTINGS,
    browserProfiles: [{ id: "work", name: "Work", kind: "persistent" }],
    browserDefaultProfileId: "work",
  });
  mocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  mocks.createTab.mockReset().mockResolvedValue(undefined);
  mocks.closeTab.mockReset().mockResolvedValue(undefined);
  mocks.registerWebview.mockReset().mockResolvedValue(undefined);
  mocks.getPreviewConfig.mockReset().mockResolvedValue({
    partition: "persist:t3-preview-work",
    webPreferences: "contextIsolation=yes",
    preloadUrl: null,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", { platform: "Linux" });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  await act(() => ensureClientSettingsHydrated());
});

afterEach(async () => {
  vi.useFakeTimers();
  await act(() => renderer?.unmount());
  renderer = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  __resetClientSettingsPersistenceForTests();
  useBrowserSurfaceStore.setState({ activityByTabId: {}, byTabId: {} });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HostedBrowserWebview during a preview panel drag", () => {
  it("holds the fit-to-panel scale while the panel edge is dragged and re-fits once on release", async () => {
    const lease = acquireBrowserSurface(RUNTIME_TAB_ID);
    // Device toolbar rails take 20px horizontally and 42px vertically: a 600×700 framed area.
    const presentWidth = (width: number) =>
      act(() => {
        lease.present({ x: 1000 - width, y: 0, width, height: 742 }, true);
      });
    await presentWidth(620);
    await renderSurface(<Surface resizing={false} />);
    const atRest = webviewStyle();
    expect(atRest.transform).toBe(`scale(${600 / 1440})`);

    // Grab the edge, then widen the panel: the guest keeps its scale (no zoom per frame) while
    // the canvas follows the panel, so the held viewport just gains margin around it.
    await act(() => renderer!.update(<Surface resizing />));
    await presentWidth(920);
    const midDrag = webviewStyle();
    expect(midDrag.transform).toBe(atRest.transform);
    expect(midDrag.left).toBe(160);
    await presentWidth(780);
    expect(webviewStyle().transform).toBe(atRest.transform);

    // Release: one re-fit to the final panel size.
    await act(() => renderer!.update(<Surface resizing={false} />));
    expect(webviewStyle().transform).toBe(`scale(${Math.min(760 / 1440, 700 / 900)})`);

    // Outside a drag, a resize (window, sidebar) still re-fits immediately.
    await presentWidth(920);
    expect(webviewStyle().transform).toBe(`scale(${900 / 1440})`);
    lease.release();
  });

  it("keeps holding while another panel's drag outlives this one", async () => {
    const lease = acquireBrowserSurface(RUNTIME_TAB_ID);
    await act(() => {
      lease.present({ x: 380, y: 0, width: 620, height: 742 }, true);
    });
    await renderSurface(<Surface resizing otherPanelResizing />);
    await act(() => renderer!.update(<Surface resizing={false} otherPanelResizing />));
    await act(() => {
      lease.present({ x: 80, y: 0, width: 920, height: 742 }, true);
    });
    expect(webviewStyle().transform).toBe(`scale(${600 / 1440})`);
    await act(() => renderer!.update(<Surface resizing={false} />));
    expect(webviewStyle().transform).toBe(`scale(${900 / 1440})`);
    lease.release();
  });

  it("holds the scale a hidden guest fits to once it is shown, not its offscreen one", async () => {
    const lease = acquireBrowserSurface(RUNTIME_TAB_ID);
    await act(() => {
      lease.present({ x: 380, y: 0, width: 620, height: 742 }, false);
    });
    await renderSurface(<Surface resizing />);
    await act(() => {
      lease.present({ x: 380, y: 0, width: 620, height: 742 }, true);
    });
    expect(webviewStyle().transform).toBe(`scale(${600 / 1440})`);
    await act(() => {
      lease.present({ x: 80, y: 0, width: 920, height: 742 }, true);
    });
    expect(webviewStyle().transform).toBe(`scale(${600 / 1440})`);
    lease.release();
  });
});
