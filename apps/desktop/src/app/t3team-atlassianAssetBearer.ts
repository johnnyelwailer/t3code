import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Electron from "electron";

import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopLocalEnvironmentAuth from "../backend/DesktopLocalEnvironmentAuth.ts";
import { getDesktopUrl } from "../electron/ElectronProtocol.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

const ASSET_CONTENT_PATH = "/api/t3team/atlassian/asset/content";
const ASSET_CONTENT_URLS = [`http://*${ASSET_CONTENT_PATH}*`, `https://*${ASSET_CONTENT_PATH}*`];

const { logWarning } = makeComponentLogger("desktop-atlassian-asset-bearer");

/** Scheme + host, since a custom scheme like `t3code://app` has an opaque `origin` of "null". */
function siteOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * The bearer goes only to the local backend's media proxy, and only for the app's own renderer:
 * a page in another window of the default session gets nothing.
 */
export function shouldAttachAssetBearer(input: {
  readonly requestUrl: string;
  readonly pageUrl: string | undefined;
  readonly applicationUrl: string;
  readonly backendUrl: string | null;
}): boolean {
  const backend = siteOf(input.backendUrl ?? undefined);
  const page = siteOf(input.pageUrl);
  if (backend === null || page === null || page !== siteOf(input.applicationUrl)) return false;
  try {
    const request = new URL(input.requestUrl);
    return siteOf(input.requestUrl) === backend && request.pathname === ASSET_CONTENT_PATH;
  } catch {
    return false;
  }
}

/**
 * The media proxy requires a session like every `/api/t3team` route. The web client's `<img>`
 * carries its cookie; the desktop renderer has no cookie on the backend's origin and an `<img>`
 * cannot send a header, so the main process adds the renderer's own bearer to those requests.
 * Electron keeps one `onBeforeSendHeaders` listener per session: this is the default session's.
 */
export const registerAtlassianAssetBearer = Effect.fn("desktop.t3team.atlassianAssetBearer")(
  function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const pool = yield* DesktopBackendPool.DesktopBackendPool;
    const localAuth = yield* DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth;
    const applicationUrl = getDesktopUrl(environment.isDevelopment);
    const context = yield* Effect.context<never>();
    const bearerFor = Effect.fn("desktop.t3team.atlassianAssetBearer.bearerFor")(
      function* (requestUrl: string, pageUrl: string | undefined) {
        const config = yield* (yield* pool.primary).currentConfig;
        const backendUrl = Option.isSome(config) ? config.value.httpBaseUrl.href : null;
        if (!shouldAttachAssetBearer({ requestUrl, pageUrl, applicationUrl, backendUrl })) {
          return null;
        }
        return yield* localAuth.getBearerToken;
      },
      Effect.catch((error) =>
        logWarning("no bearer for the Atlassian media proxy", { error: String(error) }).pipe(
          Effect.as(null),
        ),
      ),
    );

    Electron.session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ASSET_CONTENT_URLS },
      (details, callback) => {
        void Effect.runPromiseWith(context)(bearerFor(details.url, details.webContents?.getURL()))
          // A request whose callback never runs hangs, so a defect still sends it unchanged.
          .catch(() => null)
          .then((token) =>
            callback(
              token === null
                ? {}
                : {
                    requestHeaders: { ...details.requestHeaders, Authorization: `Bearer ${token}` },
                  },
            ),
          );
      },
    );
  },
);
