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

function fakeWindow(url = "") {
  const windowListeners = new Map<string, Listener>();
  const contentsListeners = new Map<string, Listener>();
  let openHandler: ((details: { url: string }) => unknown) | undefined;
  let currentUrl = url;
  const raw = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    getNormalBounds: () => ({ x: 0, y: 0, width: 1500, height: 950 }),
    loadURL: vi.fn((next: string) => {
      currentUrl = next;
      return Promise.resolve();
    }),
    on: (event: string, listener: Listener) => windowListeners.set(event, listener),
    webContents: {
      getURL: () => currentUrl,
      reload: vi.fn(),
      setWindowOpenHandler: (handler: typeof openHandler) => {
        openHandler = handler;
      },
      on: (event: string, listener: Listener) => contentsListeners.set(event, listener),
    },
  };
  return {
    window: raw as unknown as Electron.BrowserWindow,
    raw,
    emitClosed: () => windowListeners.get("closed")?.(),
    crash: (reason: string) => contentsListeners.get("render-process-gone")?.({}, { reason }),
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
  const created: Array<ReturnType<typeof fakeWindow>> = [];
  const createOptions: Electron.BrowserWindowConstructorOptions[] = [];
  let clock = 0;
  const windows = makeDetachedSurfaceWindows({
    applicationUrl,
    preloadPath: "/preload.js",
    backgroundColor: () => "#000000",
    createWindow: (options) => {
      createOptions.push(options);
      const next = fakeWindow();
      created.push(next);
      return next.window;
    },
    openExternal,
    logWarning: vi.fn(),
    now: () => clock,
  });
  const prepare = vi.fn();
  const opener = fakeWindow("t3code://app/#/pull-requests").window;
  return {
    windows,
    openExternal,
    created,
    createOptions,
    prepare,
    open: (openDetails = details) => windows.handleWindowOpen(openDetails, opener, prepare),
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe("makeDetachedSurfaceWindows", () => {
  it("leaves requests that are not detached surfaces to the caller", () => {
    const { open, created } = make();
    expect(open({ url: "https://github.com", frameName: "" })).toBe(null);
    expect(open({ url: details.url, frameName: "atlassian-oauth" })).toBe(null);
    expect(created).toHaveLength(0);
  });

  it("denies the request and makes the window itself, so the requester gets no handle on it", () => {
    const { open, created, createOptions, prepare, windows } = make();
    expect(open()).toEqual({ action: "deny" });
    expect(created).toHaveLength(1);
    const window = created[0]!;
    expect(window.raw.loadURL).toHaveBeenCalledWith(details.url);
    expect(windows.isDetached(window.window)).toBe(true);
    expect(prepare).toHaveBeenCalledWith(window.window);
    expect(createOptions[0]).toMatchObject({
      width: 1500,
      height: 950,
      titleBarStyle: "default",
      fullscreenable: true,
      webPreferences: { preload: "/preload.js", sandbox: true, contextIsolation: true },
    });
    expect(createOptions[0]?.parent).toBe(undefined);
  });

  it("brings an open surface forward on the newly asked view instead of opening another", () => {
    const { open, created } = make();
    open();
    const window = created[0]!;
    const summary = {
      ...details,
      url: `t3code://app/#${detachedSurfacePath({ ...request, params: {} })}`,
    };
    expect(open(summary)).toEqual({ action: "deny" });
    expect(created).toHaveLength(1);
    expect(window.raw.loadURL).toHaveBeenLastCalledWith(summary.url);
    expect(window.raw.restore).toHaveBeenCalled();
    expect(window.raw.focus).toHaveBeenCalled();

    window.emitClosed();
    open();
    expect(created).toHaveLength(2);
  });

  it("sends links out of a detached window to the system browser and keeps it on its surface", () => {
    const { open, created, openExternal } = make();
    open();
    const window = created[0]!;

    expect(window.openFromInside("https://github.com/acme/app/pull/12")).toEqual({
      action: "deny",
    });
    expect(openExternal).toHaveBeenCalledWith("https://github.com/acme/app/pull/12");

    expect(window.navigate("https://example.com")).toHaveBeenCalled();
    expect(window.navigate("evil://app/#/t3team-detached/pull-request")).toHaveBeenCalled();
    expect(window.navigate("data:text/html,hi")).toHaveBeenCalled();
    expect(window.navigate("t3code://app/#/settings")).toHaveBeenCalled();
    expect(
      window.navigate("t3code://app/#/t3team-detached/pull-request?tab=summary"),
    ).not.toHaveBeenCalled();
  });

  it("reloads a crashed renderer, but not forever", () => {
    const { open, created, tick } = make();
    open();
    const window = created[0]!;
    window.crash("clean-exit");
    expect(window.raw.webContents.reload).not.toHaveBeenCalled();
    for (let attempt = 0; attempt < 5; attempt += 1) window.crash("crashed");
    expect(window.raw.webContents.reload).toHaveBeenCalledTimes(3);
    tick(61_000);
    window.crash("crashed");
    expect(window.raw.webContents.reload).toHaveBeenCalledTimes(4);
  });
});
