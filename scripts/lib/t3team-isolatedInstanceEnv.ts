/**
 * Build-time switches that make a desktop build an isolated instance able to run next to another
 * install of the app (see docs in the PR that introduced them, and t3team-isolatedInstance.ts for
 * the runtime half).
 *
 * - `T3CODE_DESKTOP_ISOLATED_INSTANCE=1`  the packaged branding says `isolatedInstance: true`.
 * - `T3CODE_DESKTOP_BACKEND_PORT=<port>`  the backend is pinned to that port (1024-65535).
 *   `VITE_DESKTOP_PIN_BACKEND_PORT=1` stays an alias for the default port 3773.
 * - `T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS=3773,3774`  ports whose
 *   `http://127.0.0.1:<port>/oauth/callback` is registered in the Atlassian Developer Console.
 */
import * as Data from "effect/Data";

type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_PINNED_BACKEND_PORT = 3773;
export const MIN_PINNED_BACKEND_PORT = 1024;
export const MAX_PINNED_BACKEND_PORT = 65_535;

function parsePort(name: string, raw: string): number {
  const port = Number(raw);
  if (!/^\d+$/u.test(raw) || port < MIN_PINNED_BACKEND_PORT || port > MAX_PINNED_BACKEND_PORT) {
    throw new Error(
      `${name} must be an integer from ${MIN_PINNED_BACKEND_PORT} to ${MAX_PINNED_BACKEND_PORT}, got "${raw}"`,
    );
  }
  return port;
}

/** The port the build pins the desktop backend to, or `undefined` for the sequential scan. */
export function resolvePinnedBackendPort(env: Env): number | undefined {
  const explicit = env.T3CODE_DESKTOP_BACKEND_PORT?.trim();
  if (explicit) return parsePort("T3CODE_DESKTOP_BACKEND_PORT", explicit);
  return env.VITE_DESKTOP_PIN_BACKEND_PORT?.trim() === "1"
    ? DEFAULT_PINNED_BACKEND_PORT
    : undefined;
}

/**
 * Ports with a registered Atlassian callback, or `undefined` when this build does not check them:
 * only a pinned desktop build knows which port it will listen on.
 */
export function resolveAtlassianCallbackPorts(env: Env): readonly number[] | undefined {
  const raw = env.T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((part) => parsePort("T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS", part.trim()));
  }
  // When the explicit list is unset, a pinned build's return address is the
  // port it actually listens on (live 3783, a nightly 3774, unflavored 3773).
  // Never fall back to a hardcoded 3773/3774 while the backend is on another port.
  const pinned = resolvePinnedBackendPort(env);
  return pinned === undefined ? undefined : [pinned];
}

export function isIsolatedInstanceBuild(env: Env): boolean {
  return env.T3CODE_DESKTOP_ISOLATED_INSTANCE?.trim() === "1";
}

export const NEXI_WORK_PROTOCOL_SCHEME = "nexi-work";
export const LIVE_NEXI_APP_ID = "ch.nexplore.nexi.work";

/**
 * The OS URL-scheme claim of a build. An isolated live Nexi build claims
 * `nexi-work://` and never `t3code://`. Other isolated flavors leave the
 * scheme to live. A non-isolated build still claims the upstream schemes.
 */
export function t3codeProtocolClaims(env: Env): ReadonlyArray<{
  readonly name: string;
  readonly schemes: readonly string[];
}> {
  if (!isIsolatedInstanceBuild(env)) {
    return [{ name: "T3 Code", schemes: ["t3code", "t3code-dev"] }];
  }
  const scheme = env.T3CODE_DESKTOP_PROTOCOL_SCHEME?.trim();
  const appId = env.T3CODE_DESKTOP_APP_ID?.trim();
  if (scheme === NEXI_WORK_PROTOCOL_SCHEME || appId === LIVE_NEXI_APP_ID) {
    return [{ name: "Nexi Work", schemes: [NEXI_WORK_PROTOCOL_SCHEME] }];
  }
  return [];
}

/** Extra `desktop-branding.json` fields for an isolated instance (none for a normal build). */
export function isolatedBrandingFields(env: Env): { readonly isolatedInstance?: true } {
  return isIsolatedInstanceBuild(env) ? { isolatedInstance: true } : {};
}

/**
 * An isolated instance needs a product name: that name is the directory it owns under app data.
 * Windows and Linux builds are isolated the same way as macOS (a private home, Electron profile,
 * and early-startup paths).
 */
export function assertIsolatedBuildSupported(
  env: Env,
  _platform: "mac" | "win" | "linux",
  productName: string | undefined,
): void {
  if (!isIsolatedInstanceBuild(env)) return;
  if (productName === undefined || productName.trim() === "") {
    throw new Error(
      "T3CODE_DESKTOP_ISOLATED_INSTANCE=1 needs a product name (T3CODE_DESKTOP_PRODUCT_NAME): the product name is the isolated home's directory.",
    );
  }
}

export class T3TeamIsolatedBuildError extends Data.TaggedError("T3TeamIsolatedBuildError")<{
  readonly message: string;
}> {}
