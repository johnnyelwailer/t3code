import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { FetchHttpClient, HttpClient, type HttpClientResponse } from "effect/http";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";

const GITHUB_ASSET_TIMEOUT_MS = 20_000;
/** GitHub hands an asset to a signed object URL in one hop; this leaves room, not a chain. */
const MAX_ASSET_REDIRECTS = 3;
/** The one plain-http origin that may carry a credential: this machine (a local mock in tests and proofs). */
const isLoopbackHttp = (url: URL) =>
  url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
/** Redirects are followed here, hop by hop, so the credential's reach is decided by this code. */
const MANUAL_REDIRECT: RequestInit = { redirect: "manual" };

/**
 * One GET of an asset, following up to {@link MAX_ASSET_REDIRECTS} redirects itself. The
 * `Authorization` header rides only on a request to the URL's own origin: a redirect leads to a
 * signed object URL that authorizes on its own, and the store behind it has no business seeing a
 * GitHub token. A redirect to anything but https is refused.
 */
export function fetchAssetResponse(
  start: URL,
  token: string | undefined,
  accept = "*/*",
): Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  T3TeamAtlassianError,
  HttpClient.HttpClient
> {
  return Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    let target = start;
    for (let hop = 0; ; hop += 1) {
      const authorization =
        token !== undefined &&
        (target.protocol === "https:" || isLoopbackHttp(target)) &&
        target.origin === start.origin
          ? `Bearer ${token}`
          : undefined;
      const response = yield* httpClient
        .get(target.toString(), {
          headers: { Accept: accept, ...(authorization ? { Authorization: authorization } : {}) },
        })
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, MANUAL_REDIRECT),
          Effect.timeoutOption(Duration.millis(GITHUB_ASSET_TIMEOUT_MS)),
          Effect.mapError((cause) => toT3TeamError(cause, "Failed to download GitHub asset.")),
          Effect.flatMap((responseOption) =>
            Option.match(responseOption, {
              onNone: () =>
                Effect.fail(
                  new T3TeamAtlassianError({
                    message: `GitHub asset download timed out after ${String(GITHUB_ASSET_TIMEOUT_MS)}ms.`,
                  }),
                ),
              onSome: (settledResponse) => Effect.succeed(settledResponse),
            }),
          ),
        );
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers["location"];
      const next = location === undefined ? undefined : URL.parse(location, target.toString());
      if (next === null || next === undefined || next.protocol !== "https:") return response;
      if (hop >= MAX_ASSET_REDIRECTS) return response;
      target = next;
    }
  });
}
