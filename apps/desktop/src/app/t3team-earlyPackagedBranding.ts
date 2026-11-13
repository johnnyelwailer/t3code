/**
 * Packaged branding that early Linux startup needs before DesktopEnvironment
 * exists: the isolated home, desktop entry name, and the file that carries them.
 */
import * as Option from "effect/Option";

import { resolveDesktopBaseDir, type JoinPath } from "./DesktopStatePaths.ts";

/** Packaged branding fields that early Linux startup needs before DesktopEnvironment exists. */
export interface EarlyPackagedBranding {
  readonly isolatedInstance?: boolean;
  readonly userDataDirName?: string;
  readonly linuxDesktopEntryName?: string;
  readonly appId?: string;
}

function resolveLinuxAppDataDirectory(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
}): string {
  const xdg = input.env.XDG_CONFIG_HOME?.trim();
  return xdg && xdg.length > 0 ? xdg : input.joinPath(input.homeDirectory, ".config");
}

export function readEarlyPackagedBranding(
  resourcesPath: string | undefined,
  readFileString: (path: string) => string,
  exists: (path: string) => boolean,
  joinPath: JoinPath,
): EarlyPackagedBranding | undefined {
  if (!resourcesPath) return undefined;
  for (const candidate of [
    joinPath(resourcesPath, "desktop-branding.json"),
    joinPath(resourcesPath, "resources", "desktop-branding.json"),
  ]) {
    try {
      if (!exists(candidate)) continue;
      return JSON.parse(readFileString(candidate)) as EarlyPackagedBranding;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * The home early Linux startup reads and writes. An isolated instance uses its
 * branded app-data directory and ignores an inherited T3CODE_HOME.
 */
export function resolveEarlyDesktopBaseDir(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly packagedBranding?: EarlyPackagedBranding | undefined;
  readonly appDataDirectory?: string;
}): { readonly baseDir: string; readonly isolated: boolean } {
  const name = input.packagedBranding?.userDataDirName?.trim();
  if (input.packagedBranding?.isolatedInstance === true && name) {
    const appData =
      input.appDataDirectory ??
      resolveLinuxAppDataDirectory({
        env: input.env,
        homeDirectory: input.homeDirectory,
        joinPath: input.joinPath,
      });
    return { baseDir: input.joinPath(appData, name), isolated: true };
  }
  const t3Home = Option.fromUndefinedOr(input.env.T3CODE_HOME);
  return {
    baseDir: resolveDesktopBaseDir({
      homeDirectory: input.homeDirectory,
      joinPath: input.joinPath,
      t3Home,
    }),
    isolated: false,
  };
}

export function resolveBrandedLinuxDesktopEntryName(
  isDevelopment: boolean,
  branding: { readonly linuxDesktopEntryName?: string } | undefined,
  upstreamName: string,
): string {
  return branding?.linuxDesktopEntryName?.trim() || upstreamName;
}
