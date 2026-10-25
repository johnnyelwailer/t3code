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
  return resolvePinnedBackendPort(env) === undefined ? undefined : [DEFAULT_PINNED_BACKEND_PORT];
}

export function isIsolatedInstanceBuild(env: Env): boolean {
  return env.T3CODE_DESKTOP_ISOLATED_INSTANCE?.trim() === "1";
}

/** The `t3code://` URL scheme claim of a build. An isolated instance leaves it to the installed app. */
export function t3codeProtocolClaims(env: Env): ReadonlyArray<{
  readonly name: string;
  readonly schemes: readonly string[];
}> {
  return isIsolatedInstanceBuild(env)
    ? []
    : [{ name: "T3 Code", schemes: ["t3code", "t3code-dev"] }];
}

/** Extra `desktop-branding.json` fields for an isolated instance (none for a normal build). */
export function isolatedBrandingFields(env: Env): { readonly isolatedInstance?: true } {
  return isIsolatedInstanceBuild(env) ? { isolatedInstance: true } : {};
}

/**
 * Only macOS isolates every path an installed app shares with another install. Windows would start
 * its WSL backend on the distro's shared `~/.t3`, and Linux reads and writes shared state before
 * the isolated home exists (early settings, the device-scale-factor file, the portal desktop
 * entry, the URL-handler registration), so an isolated build for them would look isolated and not
 * be. Refuse to build one instead.
 */
export function assertIsolatedBuildSupported(
  env: Env,
  platform: "mac" | "win" | "linux",
  productName: string | undefined,
): void {
  if (!isIsolatedInstanceBuild(env)) return;
  if (platform !== "mac") {
    throw new Error(
      `T3CODE_DESKTOP_ISOLATED_INSTANCE=1: isolated instances are macOS-only, not ${platform}. ` +
        `Build this flavor for mac, or drop the isolation switch for a build that replaces the installed app.`,
    );
  }
  if (productName === undefined || productName.trim() === "") {
    throw new Error(
      "T3CODE_DESKTOP_ISOLATED_INSTANCE=1 needs a product name (T3CODE_DESKTOP_PRODUCT_NAME): the product name is the isolated home's directory.",
    );
  }
}

export class T3TeamIsolatedBuildError extends Data.TaggedError("T3TeamIsolatedBuildError")<{
  readonly message: string;
}> {}
