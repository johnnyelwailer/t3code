/**
 * Shared-home paths and constants used to detect the daily Nexi app (com.t3tools.t3code, port 3773)
 * when rc.20 (ch.nexplore.nexi.work, port 3783) is about to take over the same folder.
 */
export const OLD_NEXI_BACKEND_PORT = 3773;
export const OLD_NEXI_APP_IDS = ["com.t3tools.t3code", "com.t3tools.t3code.dev"] as const;
const SERVER_OWNER_LOCK_FILE = "server-owner.sqlite";
const SERVER_RUNTIME_STATE_FILE = "server-runtime.json";
const USERDATA_DIR_NAME = "userdata";
export const ENVIRONMENT_DESCRIPTOR_PATH = "/.well-known/t3/environment";

/** Electron userData folders the daily app may use (not rc.20's isolated electron-profile). */
const OLD_APP_USER_DATA_DIR_NAMES = [
  "t3code-v2",
  "T3 Code (Alpha)",
  "t3code",
  "Nexi Work",
  "nexi-work",
] as const;

const ELECTRON_SINGLETON_LOCK_FILE = "SingletonLock";

export type JoinPath = (first: string, ...segments: string[]) => string;

function userdataDir(home: string, join: JoinPath): string {
  return join(home, USERDATA_DIR_NAME);
}

export function serverOwnerLockPath(home: string, join: JoinPath): string {
  return join(userdataDir(home, join), SERVER_OWNER_LOCK_FILE);
}

export function serverRuntimeStatePath(home: string, join: JoinPath): string {
  return join(userdataDir(home, join), SERVER_RUNTIME_STATE_FILE);
}

export function legacyT3Home(homeDirectory: string, join: JoinPath): string {
  return join(homeDirectory, ".t3");
}

/** Windows Electron appData: %USERPROFILE%\AppData\Roaming */
export function windowsRoamingAppData(homeDirectory: string, join: JoinPath): string {
  return join(homeDirectory, "AppData", "Roaming");
}

function macAppData(homeDirectory: string, join: JoinPath): string {
  return join(homeDirectory, "Library", "Application Support");
}

function linuxAppData(homeDirectory: string, join: JoinPath, xdgConfigHome?: string): string {
  return xdgConfigHome && xdgConfigHome.length > 0 ? xdgConfigHome : join(homeDirectory, ".config");
}

export function appDataDirectoryForPlatform(input: {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly join: JoinPath;
  readonly xdgConfigHome?: string;
}): string {
  if (input.platform === "win32") return windowsRoamingAppData(input.homeDirectory, input.join);
  if (input.platform === "darwin") return macAppData(input.homeDirectory, input.join);
  return linuxAppData(input.homeDirectory, input.join, input.xdgConfigHome);
}

export function oldAppUserDataDirs(input: {
  readonly appDataDirectory: string;
  readonly join: JoinPath;
  readonly extraNames?: readonly string[];
}): string[] {
  const names = [...OLD_APP_USER_DATA_DIR_NAMES, ...(input.extraNames ?? [])];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const name of names) {
    const dir = input.join(input.appDataDirectory, name);
    if (seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

export function electronSingletonLockPath(userDataDir: string, join: JoinPath): string {
  return join(userDataDir, ELECTRON_SINGLETON_LOCK_FILE);
}
