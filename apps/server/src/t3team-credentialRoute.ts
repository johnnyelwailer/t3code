import type { AuthEnvironmentScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";

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
 * CSRF guard for the cookie path. Cookies here are SameSite=Lax, and every other localhost port
 * counts as same-site — so a page served by another local process could fire a credentialed POST.
 * A browser always sends `Origin` on POST; refuse one that is not this server. A bearer request is
 * exempt: no other origin can attach this client's token (the desktop renderer, origin
 * `t3code://app`, authenticates that way).
 */
const requireSameOrigin = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  if (request.headers.authorization !== undefined) return;
  const origin = request.headers.origin;
  if (origin === undefined) return;
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {}
  if (originHost === null || originHost !== request.headers.host) {
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
