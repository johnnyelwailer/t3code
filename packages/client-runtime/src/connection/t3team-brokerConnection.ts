import { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { bootstrapRemoteBearerSession } from "../authorization/remote.ts";
import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import * as ClientCapabilities from "../platform/capabilities.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import type {
  BrokerConnectionTarget,
  ConnectionAttemptError,
  PreparedConnection,
} from "./model.ts";

/**
 * Cloud sessions reached through the Nexi broker (`BrokerConnectionTarget`). Resolved like an SSH
 * environment, with the broker in place of `ssh -L`: the platform makes the session reachable on
 * loopback and hands over a fresh one-time pairing credential minted by the session's own server,
 * which is exchanged for a bearer session here. Everything is fresh per connect, so a restarted app,
 * a moved loopback port or an expired token heal on the next reconnect.
 */

export interface PreparedBrokerEnvironment {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly pairingCredential: string;
}

export class BrokerEnvironmentGateway extends Context.Service<
  BrokerEnvironmentGateway,
  {
    readonly attach: (input: {
      readonly sessionId: string;
      readonly expectedEnvironmentId: EnvironmentId;
    }) => Effect.Effect<PreparedBrokerEnvironment, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/connection/t3team-brokerConnection/BrokerEnvironmentGateway") {}

export const makeBrokerResolver = Effect.fn("clientRuntime.connection.broker.makeNexiBroker")(
  function* () {
    const gateway = yield* BrokerEnvironmentGateway;
    const remote = yield* RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization;
    const presentation = yield* ClientCapabilities.ClientPresentation;
    const httpClient = yield* HttpClient.HttpClient;

    return Effect.fn("clientRuntime.connection.broker.nexiBroker")(function* (
      target: BrokerConnectionTarget,
    ) {
      const prepared = yield* gateway.attach({
        sessionId: target.sessionId,
        expectedEnvironmentId: target.environmentId,
      });
      const access = yield* bootstrapRemoteBearerSession({
        httpBaseUrl: prepared.httpBaseUrl,
        credential: prepared.pairingCredential,
        // No scopes = the pairing credential's own (server default); an empty `scope` is invalid OAuth.
        ...(presentation.scopes.length > 0 ? { scopes: presentation.scopes } : {}),
        clientMetadata: presentation.metadata,
      }).pipe(
        Effect.mapError((error) => mapRemoteEnvironmentError(error)),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      );
      const authorized = yield* remote.authorizeBearer({
        expectedEnvironmentId: target.environmentId,
        httpBaseUrl: prepared.httpBaseUrl,
        wsBaseUrl: prepared.wsBaseUrl,
        bearerToken: access.access_token,
        connectionMethod: "relay",
      });
      return {
        environmentId: authorized.environmentId,
        label: authorized.label,
        httpBaseUrl: authorized.httpBaseUrl,
        socketUrl: authorized.socketUrl,
        httpAuthorization: authorized.httpAuthorization,
        target,
      } satisfies PreparedConnection;
    });
  },
);
