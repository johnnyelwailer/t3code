/**
 * Session auth for the fork's `/api/t3team/*` routes, done the way upstream
 * authenticates its raw routes (`authenticateRawRouteWithScope`, http.ts):
 * cookie or bearer, then a scope check. Reads (GET/HEAD) need
 * orchestration:read; everything else needs orchestration:operate.
 *
 * server.ts mounts it ONCE on the t3team route group, so a new route there is
 * authenticated by default. The only routes outside it carry their own
 * capability: the cloud broker (relay scopes), the Atlassian sign-in callback
 * (the one-time `state`, finished in a browser with no session) and the
 * Atlassian media proxy that `<img>` tags load.
 * @module t3team-routeAuth
 */
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerRespondable } from "effect/http";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { authenticateRawRouteWithScope } from "./http.ts";

const t3teamRouteScope = (method: string) =>
  method === "GET" || method === "HEAD"
    ? AuthOrchestrationReadScope
    : AuthOrchestrationOperateScope;

export const t3teamRouteAuthLayer = HttpRouter.middleware(
  Effect.gen(function* () {
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
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
