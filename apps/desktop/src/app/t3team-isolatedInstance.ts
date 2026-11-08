/**
 * Runtime half of the isolated-instance build switches (scripts/lib/t3team-isolatedInstanceEnv.ts).
 *
 * An isolated instance runs next to another install of the app, so everything the installed app
 * keys on a shared name moves under one directory of its own, `<appData>/<userDataDirName>`:
 * the T3 home (state database, desktop settings, control socket), and the Electron profile that
 * carries Chromium storage and the single-instance lock.
 */
import * as Option from "effect/Option";

type JoinPath = (first: string, ...segments: string[]) => string;

const ISOLATED_PROFILE_DIR_NAME = "electron-profile";
const DEFAULT_PINNED_PORT = 3773;
const MIN_PORT = 1024;
const MAX_PORT = 65_535;

/** `<appData>/<userDataDirName>`: the one directory an isolated instance owns. */
export function resolveIsolatedHome(input: {
  readonly appDataDirectory: string;
  readonly userDataDirName: string;
  readonly join: JoinPath;
}): string {
  return input.join(input.appDataDirectory, input.userDataDirName);
}

/** The Electron `userData` path of an isolated instance. */
export function resolveIsolatedProfileDir(isolatedHome: string, join: JoinPath): string {
  return join(isolatedHome, ISOLATED_PROFILE_DIR_NAME);
}

/**
 * An isolated instance's home is part of its identity: it never takes the process environment's
 * `T3CODE_HOME`, which a terminal inside the installed app exports for the installed app's own
 * home. Every other build keeps `T3CODE_HOME` as an operator decision.
 */
export function resolveEffectiveT3Home(input: {
  readonly configured: Option.Option<string>;
  readonly isolatedHome: string | undefined;
}): Option.Option<string> {
  return input.isolatedHome === undefined ? input.configured : Option.some(input.isolatedHome);
}

/** The backend's explicit home from the environment: never set for an isolated instance. */
export function explicitBackendHome(input: {
  readonly isolatedInstance: boolean;
  readonly envHome: string | undefined;
}): string | undefined {
  if (input.isolatedInstance) return undefined;
  const trimmed = input.envHome?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The environment an isolated instance gives its backend child. The child inherits the app's
 * environment, and the server ranks `T3CODE_HOME` above the home it is handed in its bootstrap
 * (apps/server/src/cli/config.ts: explicitBaseDir), so an inherited `T3CODE_HOME` naming the live
 * app's home would win over the isolated home. Naming the isolated home explicitly closes that; it
 * is the only variable the server resolves its home from (the other inputs are the `--base-dir`
 * flag and the bootstrap, which the desktop controls).
 */
export function isolatedBackendChildEnv(input: {
  readonly isolatedInstance: boolean;
  readonly home: string;
}): Readonly<Record<string, string>> {
  return input.isolatedInstance ? { T3CODE_HOME: input.home } : {};
}

/**
 * Why a packaged build that says `isolatedInstance` cannot start here, or `undefined`. Isolation is
 * all or nothing: a build that cannot isolate everything must not run half-isolated.
 */
export function isolatedInstanceStartupProblem(input: {
  readonly isolatedBranding: boolean;
  readonly userDataDirName: string | undefined;
  readonly platform: NodeJS.Platform;
}): string | undefined {
  if (!input.isolatedBranding) return undefined;
  if (input.platform !== "darwin") {
    return `This build is an isolated instance, and isolated instances are macOS-only (running on ${input.platform}). It would share state with an installed app. Install the replace-mode build instead.`;
  }
  if (!input.userDataDirName) {
    return "This build is an isolated instance, but its branding has no userDataDirName, so it has no home of its own. Rebuild it with a product name.";
  }
  return undefined;
}

/**
 * The build-time `__DESKTOP_PIN_BACKEND_PORT__` define: `true` (legacy, the default port), a port
 * number, or absent/false (sequential scan). Anything else is treated as unpinned.
 */
export function pinnedBackendPortFromDefine(define: unknown): number | undefined {
  if (define === true) return DEFAULT_PINNED_PORT;
  if (
    typeof define === "number" &&
    Number.isInteger(define) &&
    define >= MIN_PORT &&
    define <= MAX_PORT
  ) {
    return define;
  }
  return undefined;
}
