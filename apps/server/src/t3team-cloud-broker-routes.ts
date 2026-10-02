import {
  type AuthEnvironmentScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  CloudSessionFailedError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { browserApiCorsHeaders } from "./httpCors.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";

/**
 * Nexi broker sign-in and session attach for this machine's client. Unlike the other `/api/t3team`
 * routes these hand out credentials (an attach returns a pairing credential to the user's cloud
 * VM), so every one authenticates the caller the way the environment API does — cookie or bearer —
 * and requires the same scopes as the cloud-session RPCs (relay:read / relay:write).
 */

class BrokerRouteAuthError extends Schema.TaggedError<BrokerRouteAuthError>()(
  "BrokerRouteAuthError",
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
    return yield* new BrokerRouteAuthError({ reason: "cross-origin request" });
  }
});

const requireScope = (scope: AuthEnvironmentScope) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth
      .authenticateHttpRequest(request)
      .pipe(Effect.mapError(() => new BrokerRouteAuthError({ reason: "unauthenticated" })));
    if (!session.scopes.includes(scope)) {
      return yield* new BrokerRouteAuthError({ reason: `missing scope ${scope}` });
    }
  });

// The environment API's CORS policy (`*`, no credentials): the desktop renderer is another origin
// and reads these with its bearer; a cookie-authenticated cross-origin read stays impossible.
const json = (body: unknown, status = 200) =>
  HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: { ...browserApiCorsHeaders, "cache-control": "no-store" },
  });

const readSessionId = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json.pipe(Effect.orElseSucceed(() => ({})));
  const sessionId = (body as { readonly sessionId?: unknown }).sessionId;
  if (typeof sessionId === "string" && /^\d{1,20}$/.test(sessionId)) return sessionId;
  return yield* new CloudSessionFailedError({
    reason: "unknown_session",
    message: "That session does not exist.",
  });
});

const route = <A, R>(
  method: "GET" | "POST",
  path: `/api/t3team/cloud-broker/${string}`,
  scope: AuthEnvironmentScope,
  handler: (broker: NexiBrokerService["Service"]) => Effect.Effect<A, CloudSessionFailedError, R>,
) =>
  HttpRouter.add(
    method,
    path,
    Effect.gen(function* () {
      if (method === "POST") yield* requireSameOrigin;
      yield* requireScope(scope);
      return json(yield* handler(yield* NexiBrokerService));
    }).pipe(
      Effect.catchTags({
        BrokerRouteAuthError: () => Effect.succeed(json({ error: "unauthorized" }, 401)),
        // 409, not 5xx: the client shows `message` (sign in, not ready yet, broker down) as is.
        CloudSessionFailedError: (error) =>
          Effect.succeed(json({ error: error.reason, message: error.message }, 409)),
      }),
    ),
  );

export const t3teamCloudBrokerRouteLayer = Layer.mergeAll(
  route("GET", "/api/t3team/cloud-broker/status", AuthRelayReadScope, (broker) => broker.status),
  route("POST", "/api/t3team/cloud-broker/sign-in", AuthRelayWriteScope, (broker) => broker.signIn),
  route("POST", "/api/t3team/cloud-broker/sign-out", AuthRelayWriteScope, (broker) =>
    broker.signOut.pipe(Effect.as({ ok: true })),
  ),
  route("POST", "/api/t3team/cloud-broker/attach", AuthRelayWriteScope, (broker) =>
    readSessionId.pipe(Effect.flatMap(broker.attach)),
  ),
);
