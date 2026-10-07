import {
  detachedSurfacePath,
  detachedSurfaceWindowName,
} from "@t3tools/shared/t3team-detachedSurface";
import type * as Electron from "electron";
import { describe, expect, it, vi } from "vite-plus/test";

import { makeDetachedSurfaceWindows } from "./t3team-DetachedSurfaceWindows.ts";

const applicationUrl = "t3code://app/";
const request = { kind: "pull-request", key: "acme/app#12", params: { tab: "code" }, title: "PR" };
// The desktop renderer routes by hash, so its detached-surface URLs carry the route there.
const details = {
  url: `t3code://app/#${detachedSurfacePath(request)}`,
  frameName: detachedSurfaceWindowName(request),
};

type Listener = (...args: unknown[]) => void;

function fakeWindow(url = details.url) {
  const windowListeners = new Map<string, Listener>();
  const contentsListeners = new Map<string, Listener>();
  let openHandler: ((details: { url: string }) => unknown) | undefined;
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    getNormalBounds: () => ({ x: 0, y: 0, width: 1500, height: 950 }),
    loadURL: vi.fn(() => Promise.resolve()),
    on: (event: string, listener: Listener) => windowListeners.set(event, listener),
    webContents: {
      getURL: () => url,
      setWindowOpenHandler: (handler: typeof openHandler) => {
        openHandler = handler;
      },
      on: (event: string, listener: Listener) => contentsListeners.set(event, listener),
    },
  };
  return {
    window: window as unknown as Electron.BrowserWindow,
    raw: window,
    emitClosed: () => windowListeners.get("closed")?.(),
    navigate: (target: string) => {
      const event = { preventDefault: vi.fn() };
      contentsListeners.get("will-navigate")?.(event, target);
      return event.preventDefault;
    },
    openFromInside: (target: string) => openHandler?.({ url: target }),
  };
}

function make() {
  const openExternal = vi.fn();
  const windows = makeDetachedSurfaceWindows({
    applicationUrl,
    preloadPath: "/preload.js",
    backgroundColor: () => "#000000",
    openExternal,
  });
  return { windows, openExternal };
}

describe("makeDetachedSurfaceWindows", () => {
  it("leaves requests that are not detached surfaces to the caller", () => {
    const { windows } = make();
    const opener = fakeWindow().window;
    expect(windows.handleWindowOpen({ url: "https://github.com", frameName: "" }, opener)).toBe(
      null,
    );
    expect(
      windows.handleWindowOpen({ url: details.url, frameName: "atlassian-oauth" }, opener),
    ).toBe(null);
  });

  it("allows a new surface as an independent app window sized like its opener", () => {
    const { windows } = make();
    const response = windows.handleWindowOpen(details, fakeWindow().window);
    expect(response).toMatchObject({
      action: "allow",
      outlivesOpener: true,
      overrideBrowserWindowOptions: {
        width: 1500,
        height: 950,
        titleBarStyle: "default",
        fullscreenable: true,
        webPreferences: { preload: "/preload.js", sandbox: true, contextIsolation: true },
      },
    });
    expect(response?.action === "allow" && response.overrideBrowserWindowOptions?.parent).toBe(
      undefined,
    );
  });

  it("brings an open surface forward on the newly asked view instead of opening another", () => {
    const { windows } = make();
    const existing = fakeWindow(`${details.url}&file=old.ts`);
    windows.adopt(existing.window, details);
    expect(windows.isDetached(existing.window)).toBe(true);

    expect(windows.handleWindowOpen(details, fakeWindow().window)).toEqual({ action: "deny" });
    expect(existing.raw.loadURL).toHaveBeenCalledWith(details.url);
    expect(existing.raw.restore).toHaveBeenCalled();
    expect(existing.raw.focus).toHaveBeenCalled();

    existing.emitClosed();
    expect(windows.handleWindowOpen(details, fakeWindow().window)?.action).toBe("allow");
  });

  it("sends links out of a detached window to the system browser", () => {
    const { windows, openExternal } = make();
    const adopted = fakeWindow();
    windows.adopt(adopted.window, details);

    expect(adopted.openFromInside("https://github.com/acme/app/pull/12")).toEqual({
      action: "deny",
    });
    expect(openExternal).toHaveBeenCalledWith("https://github.com/acme/app/pull/12");

    expect(adopted.navigate("https://example.com")).toHaveBeenCalled();
    expect(adopted.navigate("evil://app/t3team-detached/pull-request")).toHaveBeenCalled();
    expect(adopted.navigate("data:text/html,hi")).toHaveBeenCalled();
    expect(
      adopted.navigate("t3code://app/t3team-detached/pull-request?tab=summary"),
    ).not.toHaveBeenCalled();
  });

  it("does not adopt windows that are not detached surfaces", () => {
    const { windows } = make();
    const popup = fakeWindow("https://auth.atlassian.com");
    windows.adopt(popup.window, { url: "https://auth.atlassian.com", frameName: "oauth" });
    expect(windows.isDetached(popup.window)).toBe(false);
  });
});
