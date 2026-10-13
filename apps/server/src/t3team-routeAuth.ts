/**
 * Session auth for the fork's `/api/t3team/*` routes, done the way upstream
 * authenticates its raw routes (`authenticateRawRouteWithScope`, http.ts):
 * cookie or bearer, then a scope check. Reads (GET/HEAD) need
 * orchestration:read; everything else needs orchestration:operate. A state-changing
 * method (POST/PUT/PATCH/DELETE) from a cookie session must also come from this
 * server's own page (`isCrossOriginCookieRequest`): cookies are SameSite=Lax and
 * every localhost port is same-site, so another local page could otherwise fire
 * a credentialed write (a stored Tempo token or Atlassian API token, a launch).
 *
 * server.ts mounts it ONCE on the t3team route group, so a new route there is
 * authenticated by default. The only routes outside it carry their own
 * capability: the cloud broker (relay scopes), the account sign-in routes
 * (`credentialRoute`: environment scopes plus a same-origin check), the
 * Atlassian sign-in callback (the one-time `state`, finished in a browser with
 * no session) and the Atlassian media proxy that `<img>` tags load.
 * @module t3team-routeAuth
 */
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/http";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { ServerConfig } from "./config.ts";
import { authenticateRawRouteWithScope } from "./http.ts";
import { isCrossOriginCookieRequest } from "./t3team-credentialRoute.ts";

const isStateChanging = (method: string) =>
  method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

const t3teamRouteScope = (method: string) =>
  method === "GET" || method === "HEAD"
    ? AuthOrchestrationReadScope
    : AuthOrchestrationOperateScope;

export const t3teamRouteAuthLayer = HttpRouter.middleware(
  Effect.gen(function* () {
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const config = yield* ServerConfig;
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        // Before authentication, so a cross-origin page learns nothing about the session.
        if (
          isStateChanging(request.method) &&
          (yield* isCrossOriginCookieRequest.pipe(Effect.provideService(ServerConfig, config)))
        ) {
          return HttpServerResponse.jsonUnsafe({ error: "cross-origin request" }, { status: 403 });
        }
        const denied = yield* authenticateRawRouteWithScope(t3teamRouteScope(request.method)).pipe(
          Effect.provideService(EnvironmentAuth.EnvironmentAuth, serverAuth),
          Effect.as(null),
          Effect.catchTags({
            EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
            EnvironmentInternalError: HttpServerRespondable.toResponse,
            EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
          }),
        );
        return denied ?? (yield* httpEffect);
      });
  }),
).layer;
