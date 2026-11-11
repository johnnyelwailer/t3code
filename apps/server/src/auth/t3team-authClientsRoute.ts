/**
 * `GET /api/auth/clients`: every client session of this server with its live `connected` flag.
 *
 * A cloud session's idle check (hive session.yml, "Hold the session until the handoff window")
 * polls it with an access:read token and releases the session once no other client has been
 * connected for the idle window. Without the route the request reached the static handler, the
 * check never saw an idle machine, and every idle session ran to its full hold time.
 *
 * Authenticated like upstream's raw routes (cookie or bearer), then the access:read scope. The
 * answer is a bare array of `AuthClientSession`; the caller's own entry is `current: true`.
 * @module t3team-authClientsRoute
 */
import { AuthAccessReadScope, AuthClientSession } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import {
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
  failEnvironmentScopeRequired,
} from "./http.ts";

const encodeClients = HttpServerResponse.schemaJson(Schema.Array(AuthClientSession));

export const authClientsRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/clients",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(
          EnvironmentAuth.serverAuthCredentialReason(error),
          EnvironmentAuth.serverAuthDpopFailureReason(error),
        ),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
        failEnvironmentInternal("internal_error", error),
      ),
    );
    if (!session.scopes.includes(AuthAccessReadScope)) {
      return yield* failEnvironmentScopeRequired(AuthAccessReadScope);
    }
    const clients = yield* serverAuth
      .listClientSessions(session.sessionId)
      .pipe(
        Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
          failEnvironmentInternal("client_sessions_load_failed", error),
        ),
      );
    return yield* encodeClients(clients, { headers: { "cache-control": "no-store" } });
  }),
);
