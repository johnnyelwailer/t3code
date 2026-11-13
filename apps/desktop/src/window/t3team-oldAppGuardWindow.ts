/**
 * Full-size app window that shows the quit-and-retry screen. Not a modal. Native chrome only
 * (no second close button). Retry is a hash navigation the main process observes.
 */
import type { OldAppGuardState } from "../backend/t3team-oldAppGuard.ts";
import { oldAppGuardDataUrl } from "../backend/t3team-oldAppGuardScreen.ts";
import type { OldAppGuardTheme } from "../backend/t3team-oldAppGuardScreen.ts";
import type { HomeGuardSession } from "../backend/t3team-oldAppGuard.ts";

export type GuardWindowHandle = {
  readonly loadURL: (url: string) => Promise<void> | void;
  readonly executeJavaScript?: (code: string) => Promise<unknown>;
  readonly onHashRetry?: (handler: () => void) => () => void;
  readonly onClosed?: (handler: () => void) => () => void;
  readonly show?: () => void;
  readonly destroy?: () => void;
  readonly isDestroyed?: () => boolean;
};

export type OpenOldAppGuardWindowInput = {
  readonly theme: OldAppGuardTheme;
  readonly open: () => Promise<GuardWindowHandle> | GuardWindowHandle;
};

const RETRY_HASH = /^#retry-/;

export function isRetryHash(hash: string): boolean {
  return RETRY_HASH.test(hash);
}

export async function presentOldAppGuardWindow(
  input: OpenOldAppGuardWindowInput,
): Promise<HomeGuardSession> {
  const window = await input.open();
  let retryWaiter: (() => void) | undefined;
  let closed = false;
  let pendingRetry = false;
  const unlistenRetry = window.onHashRetry?.(() => {
    const next = retryWaiter;
    retryWaiter = undefined;
    if (next) next();
    else pendingRetry = true;
  });
  const unlistenClosed = window.onClosed?.(() => {
    closed = true;
  });
  await window.loadURL(oldAppGuardDataUrl({ state: "blocked", theme: input.theme }));
  window.show?.();
  return {
    setState: (state: OldAppGuardState) => {
      if (window.isDestroyed?.()) return;
      const code = `window.__nexiSetGuardState(${JSON.stringify(state)})`;
      void window.executeJavaScript?.(code);
    },
    waitForRetry: () =>
      new Promise<void>((resolve) => {
        if (pendingRetry) {
          pendingRetry = false;
          resolve();
          return;
        }
        retryWaiter = resolve;
      }),
    close: () => {
      unlistenRetry?.();
      unlistenClosed?.();
      if (!closed && !window.isDestroyed?.()) window.destroy?.();
    },
  };
}

/** BrowserWindow options: same size as the main window, native title bar, no extra frame chrome. */
export function oldAppGuardWindowOptions(input: {
  readonly displayName: string;
  readonly shouldUseDarkColors: boolean;
  readonly platform: NodeJS.Platform;
  readonly backgroundColor?: string;
}): Record<string, unknown> {
  const dark = input.shouldUseDarkColors;
  const titleBar =
    input.platform === "darwin"
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 19 } }
      : {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: input.backgroundColor ?? (dark ? "#000000" : "#ffffff"),
            height: 40,
            symbolColor: dark ? "#f8fafc" : "#1f2937",
          },
        };
  return {
    width: 1100,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: input.backgroundColor ?? (dark ? "#000000" : "#ffffff"),
    title: input.displayName,
    ...titleBar,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  };
}
