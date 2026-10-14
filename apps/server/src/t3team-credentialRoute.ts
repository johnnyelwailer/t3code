import type { AuthEnvironmentScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { ServerConfig } from "./config.ts";

/**
 * A `/api/t3team` route that hands out or changes credentials (an account sign-in, a cloud session's
 * pairing credential), so it authenticates the caller the way the environment API does — cookie or
 * bearer — and requires an environment scope. Errors the handler maps with `onError` become a 409
 * with a user-facing `message`; an unauthenticated caller gets a 401.
 */

class LocalApiRouteAuthError extends Schema.TaggedError<LocalApiRouteAuthError>()(
  "LocalApiRouteAuthError",
  {
    reason: Schema.String,
  },
) {}

/**
 * Whether a cookie-authenticated POST came from this server's own page. Its `Origin` must name this
 * server, or the dev web server (`devUrl`): in web dev the page is served by Vite, whose `/api`
 * proxy rewrites `Host` to the backend's, so the browser's origin never matches `Host` there.
 */
export function isOwnOrigin(input: {
  readonly origin: string;
  readonly host: string | undefined;
  readonly devUrl: URL | undefined;
}): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(input.origin);
  } catch {
    return false;
  }
  if (originUrl.host === input.host) return true;
  return input.devUrl !== undefined && isSameDevOrigin(originUrl, input.devUrl);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Dev only: a tab opened at 127.0.0.1 is the same dev server as `devUrl` at localhost. */
function isSameDevOrigin(origin: URL, devUrl: URL): boolean {
  if (origin.origin === devUrl.origin) return true;
  return (
    origin.protocol === devUrl.protocol &&
    origin.port === devUrl.port &&
    LOOPBACK_HOSTS.has(origin.hostname) &&
    LOOPBACK_HOSTS.has(devUrl.hostname)
  );
}

/**
 * CSRF guard for the cookie path. Cookies here are SameSite=Lax, and every other localhost port
 * counts as same-site — so a page served by another local process could fire a credentialed POST.
 * A browser always sends `Origin` on POST; a request whose `Origin` is not this server is cross-origin.
 * A bearer request is exempt: no other origin can attach this client's token (the desktop renderer,
 * origin `t3code://app`, authenticates that way, with `credentials: "omit"`). Only when it carries
 * no cookie: `selectRequestCredential` prefers a session cookie over the `Authorization` header, so
 * a foreign page could send the victim's cookie next to a junk bearer. Cookie names vary (per port,
 * legacy, dev), so any `Cookie` header counts. Shared by `credentialRoute` and the
 * `t3teamRouteAuthLayer` group, so there is one comparison.
 */
export const isCrossOriginCookieRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  if (request.headers.authorization !== undefined && request.headers.cookie === undefined) {
    return false;
  }
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  const { devUrl } = yield* ServerConfig;
  return !isOwnOrigin({ origin, host: request.headers.host, devUrl });
});

const requireSameOrigin = Effect.gen(function* () {
  if (yield* isCrossOriginCookieRequest) {
    return yield* new LocalApiRouteAuthError({ reason: "cross-origin request" });
  }
});

const requireScope = (scope: AuthEnvironmentScope) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth
      .authenticateHttpRequest(request)
      .pipe(Effect.mapError(() => new LocalApiRouteAuthError({ reason: "unauthenticated" })));
    if (!session.scopes.includes(scope)) {
      return yield* new LocalApiRouteAuthError({ reason: `missing scope ${scope}` });
    }
  });

// CORS comes from upstream's global layer (http.ts): the desktop renderer is another origin and
// reads these with its bearer; a cookie-authenticated cross-origin read stays impossible.
const json = (body: unknown, status = 200) =>
  HttpServerResponse.jsonUnsafe(body, { status, headers: { "cache-control": "no-store" } });

/** A user-facing failure the client shows as is (409): sign in, not ready yet, service down. */
export interface LocalApiRouteFailure {
  readonly error: string;
  readonly message: string;
}

export const credentialRoute = <A, E, R>(input: {
  readonly method: "GET" | "POST";
  readonly path: `/api/t3team/${string}`;
  readonly scope: AuthEnvironmentScope;
  readonly handler: Effect.Effect<A, E, R>;
  readonly onError: (error: E) => LocalApiRouteFailure;
}) =>
  HttpRouter.add(
    input.method,
    input.path,
    Effect.gen(function* () {
      if (input.method === "POST") yield* requireSameOrigin;
      yield* requireScope(input.scope);
      return json(yield* input.handler);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          Schema.is(LocalApiRouteAuthError)(error)
            ? json({ error: "unauthorized" }, 401)
            : json(input.onError(error as E), 409),
        ),
      ),
    ),
  );
