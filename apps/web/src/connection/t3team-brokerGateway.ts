import {
  BrokerEnvironmentGateway,
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";

import { CredentialRequestError } from "~/account/t3team-credentialRequest";
import { cloudBrokerApi } from "~/cloud/t3team-cloudBrokerApi";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary/target";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The forwarder listens on the server machine's loopback, so only a client on that machine can use
 * it: the desktop app, or a browser opened on the same computer as the server.
 */
function clientSharesServerMachine(): boolean {
  if (typeof window !== "undefined" && window.desktopBridge !== undefined) return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(resolvePrimaryEnvironmentHttpUrl("/")).hostname);
  } catch {
    return false;
  }
}

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => {
      if (
        cause instanceof CredentialRequestError &&
        (cause.reason === "broker_sign_in_required" || cause.reason === "unauthorized")
      ) {
        return new ConnectionBlockedError({ reason: "authentication", detail: cause.message });
      }
      return new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    },
  });

const requireSameMachine = Effect.suspend(() =>
  clientSharesServerMachine()
    ? Effect.void
    : Effect.fail(
        new ConnectionBlockedError({
          reason: "unsupported",
          detail:
            "Nexi cloud sessions connect from the Nexi Work desktop app, or a browser on the same computer.",
        }),
      ),
);

/**
 * Web/desktop side of `BrokerEnvironmentGateway`: this machine's server runs the loopback forwarder
 * and asks the broker for pairing credentials, so each is one authenticated call to it. Failures map
 * to what the connection UI already understands: sign-in problems block, everything else retries.
 */
export const webBrokerEnvironmentGateway = BrokerEnvironmentGateway.of({
  attach: (input) =>
    Effect.gen(function* () {
      yield* requireSameMachine;
      const result = yield* call(() =>
        cloudBrokerApi.attach(input.sessionId, String(input.expectedEnvironmentId)),
      );
      if (String(result.environmentId) !== String(input.expectedEnvironmentId)) {
        return yield* new ConnectionBlockedError({
          reason: "configuration",
          detail:
            "The cloud session now runs a different environment. Connect to it again from the cloud session list.",
        });
      }
      return {
        sessionId: result.sessionId ?? input.sessionId,
        httpBaseUrl: result.httpBaseUrl,
        wsBaseUrl: result.wsBaseUrl,
      };
    }),
  pair: (input) =>
    requireSameMachine.pipe(
      Effect.andThen(call(() => cloudBrokerApi.pair(input.sessionId))),
      Effect.map((result) => result.pairingCredential),
    ),
});
