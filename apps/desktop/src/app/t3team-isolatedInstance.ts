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
 * An explicit `T3CODE_HOME` is an operator decision and still wins; an isolated instance otherwise
 * behaves as if `T3CODE_HOME` were its own directory.
 */
export function resolveEffectiveT3Home(input: {
  readonly configured: Option.Option<string>;
  readonly isolatedHome: string | undefined;
}): Option.Option<string> {
  if (Option.isSome(input.configured) && input.configured.value.trim().length > 0) {
    return input.configured;
  }
  return input.isolatedHome === undefined ? input.configured : Option.some(input.isolatedHome);
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
