// @effect-diagnostics nodeBuiltinImport:off - dirname of the isolated profile is a Node path at boot.
/**
 * Wires detection, profile takeover, and the quit-and-retry window into desktop bootstrap.
 */
import * as NodePath from "node:path";

import { migrateNexiProfile } from "./t3team-homeMigration.ts";
import {
  detectOldApp,
  detectOldAppSync,
  homesToScan,
  userDataDirsToScan,
} from "./t3team-oldAppPresence.ts";
import { runHomeGuard, type HomeGuardResult } from "./t3team-oldAppGuard.ts";
import {
  isRetryHash,
  oldAppGuardWindowOptions,
  presentOldAppGuardWindow,
  type GuardWindowHandle,
} from "../window/t3team-oldAppGuardWindow.ts";
import type { JoinPath } from "./t3team-oldAppPaths.ts";

export type GuardBootEnvironment = {
  readonly baseDir: string;
  readonly homeDirectory: string;
  readonly appDataDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly path: { readonly join: JoinPath };
  readonly isDevelopment: boolean;
  readonly isolatedProfileDir: string | undefined;
  readonly isolatedInstance: boolean;
  readonly displayName: string;
  readonly legacyUserDataDirName: string | undefined;
  readonly userDataDirName: string | undefined;
};

export type GuardBrowserWindow = {
  readonly loadURL: (url: string) => Promise<void>;
  readonly webContents: {
    readonly executeJavaScript: (code: string) => Promise<unknown>;
    readonly on: (event: "did-navigate-in-page", listener: (...args: never[]) => void) => unknown;
    readonly off: (event: "did-navigate-in-page", listener: (...args: never[]) => void) => unknown;
  };
  readonly on: (event: "closed", listener: (...args: never[]) => void) => unknown;
  readonly off: (event: "closed", listener: (...args: never[]) => void) => unknown;
  readonly show: () => void;
  readonly destroy: () => void;
  readonly isDestroyed: () => boolean;
  readonly once?: (event: "ready-to-show", listener: (...args: never[]) => void) => unknown;
};

export function pickGuardEnvironment(environment: GuardBootEnvironment): GuardBootEnvironment {
  return {
    baseDir: environment.baseDir,
    homeDirectory: environment.homeDirectory,
    appDataDirectory: environment.appDataDirectory,
    platform: environment.platform,
    path: environment.path,
    isDevelopment: environment.isDevelopment,
    isolatedProfileDir: environment.isolatedProfileDir,
    isolatedInstance: environment.isolatedInstance,
    displayName: environment.displayName,
    legacyUserDataDirName: environment.legacyUserDataDirName,
    userDataDirName: environment.userDataDirName,
  };
}

export function detectInputFromEnvironment(environment: GuardBootEnvironment) {
  const join = environment.path.join;
  return {
    homes: homesToScan({
      brandedHome: environment.baseDir,
      homeDirectory: environment.homeDirectory,
      join,
    }),
    userDataDirs: userDataDirsToScan({
      platform: environment.platform,
      homeDirectory: environment.homeDirectory,
      join,
      appDataDirectory: environment.appDataDirectory,
      extraNames: [
        ...(environment.legacyUserDataDirName ? [environment.legacyUserDataDirName] : []),
        ...(environment.userDataDirName ? [environment.userDataDirName] : []),
      ],
    }),
    join,
    selfPids: [process.pid],
  };
}

export function oldAppIsRunningOnHome(environment: GuardBootEnvironment): boolean {
  return detectOldAppSync(detectInputFromEnvironment(environment)).running;
}

/** Idempotent profile copy; skipped while the daily app is running, run after Retry. */
function migrateIsolatedProfiles(environment: GuardBootEnvironment): void {
  const isolatedProfileDir = environment.isolatedProfileDir;
  if (isolatedProfileDir === undefined) return;
  const join = environment.path.join;
  const sharedNames = environment.isDevelopment
    ? (["t3code-dev", "T3 Code (Dev)"] as const)
    : (["t3code-v2", "T3 Code (Alpha)", "t3code"] as const);
  const adjacentNexiHome = NodePath.dirname(isolatedProfileDir);
  for (const name of sharedNames) {
    migrateNexiProfile({
      sourceProfileDir: join(environment.appDataDirectory, name),
      destinationProfileDir: isolatedProfileDir,
      join,
      stamp: "profile",
      adjacentNexiHome,
      platform: environment.platform,
    });
  }
}

export function wrapGuardBrowserWindow(window: GuardBrowserWindow): GuardWindowHandle {
  return {
    loadURL: (url) => window.loadURL(url),
    executeJavaScript: (code) => window.webContents.executeJavaScript(code),
    onHashRetry: (handler) => {
      const listener = (...args: never[]) => {
        const url = typeof args[1] === "string" ? args[1] : "";
        try {
          if (isRetryHash(new URL(url).hash)) handler();
        } catch {
          const hashIndex = url.lastIndexOf("#");
          if (hashIndex >= 0 && isRetryHash(url.slice(hashIndex))) handler();
        }
      };
      window.webContents.on("did-navigate-in-page", listener);
      return () => window.webContents.off("did-navigate-in-page", listener);
    },
    onClosed: (handler) => {
      const listener = () => handler();
      window.on("closed", listener);
      return () => window.off("closed", listener);
    },
    show: () => {
      if (!window.isDestroyed()) window.show();
    },
    destroy: () => {
      if (!window.isDestroyed()) window.destroy();
    },
    isDestroyed: () => window.isDestroyed(),
  };
}

export const runDesktopHomeGuard = (input: {
  readonly environment: GuardBootEnvironment;
  readonly shouldUseDarkColors: boolean;
  readonly createWindow: (options: Record<string, unknown>) => Promise<GuardWindowHandle>;
}): Promise<HomeGuardResult> =>
  runHomeGuard({
    detect: () => detectOldApp(detectInputFromEnvironment(input.environment)),
    migrate: () => migrateIsolatedProfiles(input.environment),
    present: () =>
      presentOldAppGuardWindow({
        theme: input.shouldUseDarkColors ? "dark" : "light",
        open: async () => {
          const created = await input.createWindow(
            oldAppGuardWindowOptions({
              displayName: input.environment.displayName,
              shouldUseDarkColors: input.shouldUseDarkColors,
              platform: input.environment.platform,
            }),
          );
          return created;
        },
      }),
  });
