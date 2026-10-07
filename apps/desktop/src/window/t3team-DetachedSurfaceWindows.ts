/**
 * App windows for detached surfaces (`@t3tools/shared/t3team-detachedSurface`).
 *
 * The renderer detaches a surface with `window.open` on a same-origin detached-surface URL. The
 * main window's open handler hands that request here, and it becomes an app window of its own:
 * the app's preload and session, so it is already signed in; a native title bar, so it can be
 * dragged to another screen and put in full screen on its own; and independent of the main
 * window, so it is neither held above it nor closed with it. Each surface has one window: asking
 * again for a surface that is already open brings its window forward, on the newly asked view.
 *
 * The request itself is always denied and the window created here instead. Whatever asked — the
 * renderer, or a sandboxed document preview with popups allowed — gets no handle on the window
 * it caused: no opener, no WindowProxy to navigate or script it with.
 */
import { isDetachedSurfaceWindowRequest } from "@t3tools/shared/t3team-detachedSurface";
import type * as Electron from "electron";

const DETACHED_WINDOW_MIN_WIDTH = 480;
const DETACHED_WINDOW_MIN_HEIGHT = 360;
const DETACHED_WINDOW_DEFAULT_SIZE = { width: 1280, height: 860 } as const;
// A renderer that dies on load must not reload forever: a few tries a minute, then it stays down.
const CRASH_RELOAD_MAX_ATTEMPTS = 3;
const CRASH_RELOAD_WINDOW_MS = 60_000;

interface WindowOpenDetails {
  readonly url: string;
  readonly frameName: string;
}

export interface DetachedSurfaceWindows {
  /**
   * The open-handler answer for a detached-surface request, or null when the request is not one
   * (the caller's own handling applies). A surface already open is revealed on the new view; a
   * new one gets a window. Either way the request is denied — the window is made here.
   */
  readonly handleWindowOpen: (
    details: WindowOpenDetails,
    opener: Electron.BrowserWindow,
    /** What every app window gets from its opener: the context menu, the shortcut guards. */
    prepareWindow: (window: Electron.BrowserWindow) => void,
  ) => Electron.WindowOpenHandlerResponse | null;
  readonly isDetached: (window: Electron.BrowserWindow) => boolean;
}

export function makeDetachedSurfaceWindows(input: {
  readonly applicationUrl: string;
  readonly preloadPath: string;
  readonly backgroundColor: () => string;
  readonly createWindow: (
    options: Electron.BrowserWindowConstructorOptions,
  ) => Electron.BrowserWindow;
  /** Opens a URL the app does not own in the system browser, if it is safe to. */
  readonly openExternal: (url: string) => void;
  readonly logWarning: (message: string, details?: Record<string, unknown>) => void;
  readonly now?: () => number;
}): DetachedSurfaceWindows {
  const windowsByName = new Map<string, Electron.BrowserWindow>();
  const detached = new WeakSet<Electron.BrowserWindow>();
  const now = input.now ?? Date.now;

  const isRequest = (details: WindowOpenDetails) =>
    isDetachedSurfaceWindowRequest({
      applicationUrl: input.applicationUrl,
      url: details.url,
      frameName: details.frameName,
    });

  const reveal = (window: Electron.BrowserWindow) => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  const guard = (window: Electron.BrowserWindow, frameName: string) => {
    const contents = window.webContents;
    // Links out of a detached surface go where the main window's go: the system browser. Without
    // a handler of its own, Electron would open them as bare windows of the app.
    contents.setWindowOpenHandler(({ url }) => {
      input.openExternal(url);
      return { action: "deny" };
    });
    // A detached window only ever shows a detached surface; anything else it is asked to load
    // goes to the system browser (which refuses what is not a web URL).
    contents.on("will-navigate", (event, url) => {
      if (isRequest({ url, frameName })) return;
      event.preventDefault();
      input.openExternal(url);
    });
    let crashes: number[] = [];
    contents.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit" || window.isDestroyed()) return;
      const at = now();
      crashes = [...crashes.filter((time) => at - time < CRASH_RELOAD_WINDOW_MS), at];
      if (crashes.length > CRASH_RELOAD_MAX_ATTEMPTS) {
        input.logWarning("detached surface renderer keeps crashing; leaving it down", {
          reason: details.reason,
        });
        return;
      }
      contents.reload();
    });
  };

  return {
    handleWindowOpen: (details, opener, prepareWindow) => {
      if (!isRequest(details)) return null;
      const existing = windowsByName.get(details.frameName);
      if (existing !== undefined && !existing.isDestroyed()) {
        if (existing.webContents.getURL() !== details.url) {
          void existing.loadURL(details.url).catch(() => undefined);
        }
        reveal(existing);
        return { action: "deny" };
      }
      // The opener's size, not its position: the new window cascades from where the system puts
      // it, and the reader moves it to whichever screen it is for.
      const openerBounds = opener.isDestroyed() ? null : opener.getNormalBounds();
      let window: Electron.BrowserWindow;
      try {
        window = input.createWindow({
          width: openerBounds?.width ?? DETACHED_WINDOW_DEFAULT_SIZE.width,
          height: openerBounds?.height ?? DETACHED_WINDOW_DEFAULT_SIZE.height,
          minWidth: DETACHED_WINDOW_MIN_WIDTH,
          minHeight: DETACHED_WINDOW_MIN_HEIGHT,
          show: true,
          // A native title bar: the detached page has no app top bar to drag by.
          titleBarStyle: "default",
          autoHideMenuBar: true,
          fullscreenable: true,
          backgroundColor: input.backgroundColor(),
          webPreferences: {
            preload: input.preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // The main window hosts browser previews; a detached surface does not.
            webviewTag: false,
          },
        });
      } catch (cause) {
        input.logWarning("failed to create a detached surface window", { cause: String(cause) });
        return { action: "deny" };
      }
      detached.add(window);
      windowsByName.set(details.frameName, window);
      window.on("closed", () => {
        if (windowsByName.get(details.frameName) === window) {
          windowsByName.delete(details.frameName);
        }
      });
      prepareWindow(window);
      guard(window, details.frameName);
      void window.loadURL(details.url).catch(() => undefined);
      return { action: "deny" };
    },
    isDetached: (window) => detached.has(window),
  };
}
