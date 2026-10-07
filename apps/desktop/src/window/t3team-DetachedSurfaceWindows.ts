/**
 * App windows for detached surfaces (`@t3tools/shared/t3team-detachedSurface`).
 *
 * The renderer detaches a surface with `window.open` on a same-origin detached-surface URL. The
 * main window's open handler hands that request here, and it becomes an app window of its own:
 * the app's preload and session, so it is already signed in; a native title bar, so it can be
 * dragged to another screen and put in full screen on its own; and independent of the main
 * window, so it is neither held above it nor closed with it. Each surface has one window: asking
 * again for a surface that is already open brings its window forward, on the newly asked view.
 */
import {
  isDetachedSurfaceWindowRequest,
  isSameApplicationOrigin,
} from "@t3tools/shared/t3team-detachedSurface";
import type * as Electron from "electron";

const DETACHED_WINDOW_MIN_WIDTH = 480;
const DETACHED_WINDOW_MIN_HEIGHT = 360;
const DETACHED_WINDOW_DEFAULT_SIZE = { width: 1280, height: 860 } as const;

interface WindowOpenDetails {
  readonly url: string;
  readonly frameName: string;
}

export interface DetachedSurfaceWindows {
  /**
   * The open-handler answer for a detached-surface request, or null when the request is not one
   * (the caller's own handling applies). A surface already open is revealed and the request
   * denied; a new one is allowed with the detached window's options.
   */
  readonly handleWindowOpen: (
    details: WindowOpenDetails,
    opener: Electron.BrowserWindow,
  ) => Electron.WindowOpenHandlerResponse | null;
  /** Takes charge of a window the main window just created, when it is a detached surface. */
  readonly adopt: (window: Electron.BrowserWindow, details: WindowOpenDetails) => void;
  readonly isDetached: (window: Electron.BrowserWindow) => boolean;
}

export function makeDetachedSurfaceWindows(input: {
  readonly applicationUrl: string;
  readonly preloadPath: string;
  readonly backgroundColor: () => string;
  /** Opens a URL the app does not own in the system browser, if it is safe to. */
  readonly openExternal: (url: string) => void;
}): DetachedSurfaceWindows {
  const windowsByName = new Map<string, Electron.BrowserWindow>();
  const detached = new WeakSet<Electron.BrowserWindow>();

  const isRequest = (details: WindowOpenDetails) =>
    isDetachedSurfaceWindowRequest({
      applicationUrl: input.applicationUrl,
      url: details.url,
      frameName: details.frameName,
    });

  const isSameOrigin = (url: string) => isSameApplicationOrigin(input.applicationUrl, url);

  const reveal = (window: Electron.BrowserWindow) => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  return {
    handleWindowOpen: (details, opener) => {
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
      return {
        action: "allow",
        // A reload or crash recovery of the main window must not close the windows it opened.
        outlivesOpener: true,
        overrideBrowserWindowOptions: {
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
        },
      };
    },
    adopt: (window, details) => {
      if (!isRequest(details)) return;
      detached.add(window);
      windowsByName.set(details.frameName, window);
      window.on("closed", () => {
        if (windowsByName.get(details.frameName) === window)
          windowsByName.delete(details.frameName);
      });
      const contents = window.webContents;
      // Links out of a detached surface go where the main window's go: the system browser. Without
      // a handler of its own, Electron would open them as bare windows of the app.
      contents.setWindowOpenHandler(({ url }) => {
        input.openExternal(url);
        return { action: "deny" };
      });
      contents.on("will-navigate", (event, url) => {
        if (isSameOrigin(url)) return;
        event.preventDefault();
        input.openExternal(url);
      });
    },
    isDetached: (window) => detached.has(window),
  };
}
