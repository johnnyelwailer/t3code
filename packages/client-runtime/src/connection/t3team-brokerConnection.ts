import { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";

import { bootstrapRemoteBearerSession } from "../authorization/remote.ts";
import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import * as ClientCapabilities from "../platform/capabilities.ts";
import { BearerConnectionCredential } from "./catalog.ts";
import * as ConnectionCredentialStore from "./credentialStore.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import type {
  BrokerConnectionTarget,
  ConnectionAttemptError,
  PreparedConnection,
} from "./model.ts";

/**
 * Cloud sessions reached through the Nexi broker (`BrokerConnectionTarget`). Resolved like an SSH
 * environment, with the broker in place of `ssh -L`: the platform makes the session reachable on
 * loopback (fresh per connect, so a restarted app or a moved port heals on reconnect), and the
 * client authenticates with a bearer session on the VM's server.
 *
 * The bearer is minted ONCE — from a one-time pairing credential — and kept in the credential store,
 * so a reconnect reuses it. Pairing is a database write on the VM that can be slow while the session
 * is busy; doing it on every reconnect turned every network blip into a long "reconnecting".
 */

export interface AttachedBrokerEnvironment {
  /** The session attached: the target's, or the live one now serving the same environment. */
  readonly sessionId: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

export class BrokerEnvironmentGateway extends Context.Service<
  BrokerEnvironmentGateway,
  {
    readonly attach: (input: {
      readonly sessionId: string;
      readonly expectedEnvironmentId: EnvironmentId;
    }) => Effect.Effect<AttachedBrokerEnvironment, ConnectionAttemptError>;
    /** A fresh one-time pairing credential from the session's own server. */
    readonly pair: (input: {
      readonly sessionId: string;
    }) => Effect.Effect<string, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/connection/t3team-brokerConnection/BrokerEnvironmentGateway") {}

/** Where the session's bearer lives in the credential store. */
export const brokerCredentialKey = (sessionId: string) => `nexi-broker:${sessionId}`;

export const makeBrokerResolver = Effect.fn("clientRuntime.connection.broker.makeNexiBroker")(
  function* () {
    const gateway = yield* BrokerEnvironmentGateway;
    const remote = yield* RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization;
    const presentation = yield* ClientCapabilities.ClientPresentation;
    const credentials = yield* ConnectionCredentialStore.ConnectionCredentialStore;
    const httpClient = yield* HttpClient.HttpClient;

    return Effect.fn("clientRuntime.connection.broker.nexiBroker")(function* (
      target: BrokerConnectionTarget,
    ) {
      const attached = yield* gateway.attach({
        sessionId: target.sessionId,
        expectedEnvironmentId: target.environmentId,
      });
      const key = brokerCredentialKey(attached.sessionId);
      const authorize = (bearerToken: string) =>
        remote.authorizeBearer({
          expectedEnvironmentId: target.environmentId,
          httpBaseUrl: attached.httpBaseUrl,
          wsBaseUrl: attached.wsBaseUrl,
          bearerToken,
          connectionMethod: "relay",
        });

      const stored = yield* credentials.get(key).pipe(Effect.orElseSucceed(() => Option.none()));
      if (Option.isSome(stored) && stored.value._tag === "BearerConnectionCredential") {
        const reused = yield* authorize(stored.value.token).pipe(
          Effect.map(Option.some),
          // Only a rejected bearer means "pair again"; anything else (VM busy, network) stays an error
          // the connection supervisor retries — re-pairing would not help and costs a VM write.
          Effect.catchIf(
            (error) => error._tag === "ConnectionBlockedError" && error.reason === "authentication",
            () => credentials.remove(key).pipe(Effect.ignore, Effect.as(Option.none())),
          ),
        );
        if (Option.isSome(reused)) return { ...reused.value, target } satisfies PreparedConnection;
      }

      const pairingCredential = yield* gateway.pair({ sessionId: attached.sessionId });
      const access = yield* bootstrapRemoteBearerSession({
        httpBaseUrl: attached.httpBaseUrl,
        credential: pairingCredential,
        // No scopes = the pairing credential's own (server default); an empty `scope` is invalid OAuth.
        ...(presentation.scopes.length > 0 ? { scopes: presentation.scopes } : {}),
        clientMetadata: presentation.metadata,
      }).pipe(
        Effect.mapError((error) => mapRemoteEnvironmentError(error)),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      );
      yield* credentials
        .put(key, new BearerConnectionCredential({ token: access.access_token }))
        .pipe(Effect.ignore);
      const authorized = yield* authorize(access.access_token);
      return { ...authorized, target } satisfies PreparedConnection;
    });
  },
);
