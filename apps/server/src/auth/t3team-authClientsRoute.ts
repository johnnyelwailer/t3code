/**
 * `GET /api/auth/clients`: client sessions with their live `connected` flag, for the cloud session's
 * idle check (session.yml). Raw-route auth (cookie or bearer), then access:read; a bare array.
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
