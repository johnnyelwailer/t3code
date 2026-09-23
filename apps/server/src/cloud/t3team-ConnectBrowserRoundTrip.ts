import { ExternalLauncherError } from "@t3tools/contracts";
import { buildConnectAuthorizeRequestUrl } from "@t3tools/shared/connectAuth";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";

import type {
  CloudCliTokenManagerError,
  PersistedToken,
} from "./CliTokenManager.ts";
import { cloudCliOAuthConfig, hostedAppUrlConfig } from "./publicConfig.ts";
import { startConnectLoopbackCallback } from "./t3team-ConnectLoopbackCallback.ts";
import { exchangeLoopbackAuthorizationCode } from "./t3team-ConnectTokenExchange.ts";
import { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import type { ConnectCredentialMintFailureReason } from "./t3team-ConnectCredentialMintError.ts";

const fail = (
  reason: ConnectCredentialMintFailureReason,
  cause: unknown,
): Effect.Effect<never, ConnectCredentialMintError> =>
  Effect.fail(new ConnectCredentialMintError({ reason, cause }));

const makePkceRequest = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const verifier = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
  const challenge = Encoding.encodeBase64Url(
    yield* crypto.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const state = Encoding.encodeBase64Url(yield* crypto.randomBytes(16));
  return { verifier, challenge, state };
});

/**
 * One in-app T3 Connect browser round-trip: generate PKCE, listen on the
 * 127.0.0.1 callback, open the hosted /connect page in the user's default
 * browser (it redirects the code straight to the listener — the loopback
 * round-trip the hosted service already supports for the CLI), wait at most
 * `timeout`, exchange the code, and store the credential.
 *
 * Scoped: the listener is torn down when the attempt ends — on success, on
 * any failure, and on the timeout. The PKCE verifier never leaves this
 * process, so a captured authorization code is useless to anyone else.
 */
export const runConnectBrowserRoundTrip = Effect.fn(
  "cloud.connect.browser_round_trip",
)(function* (input: {
  readonly timeout: Duration.Duration;
  readonly launchBrowser: (url: string) => Effect.Effect<void, ExternalLauncherError>;
  readonly store: (token: PersistedToken) => Effect.Effect<void, CloudCliTokenManagerError>;
}) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const metadata = yield* cloudCliOAuthConfig;
      const hostedAppUrl = yield* hostedAppUrlConfig;
      const { verifier, challenge, state } = yield* makePkceRequest;
      const callback = yield* Deferred.make<string>();
      yield* Effect.forkScoped(
        startConnectLoopbackCallback({
          port: metadata.loopbackPort,
          state,
          onCode: (code) => Deferred.succeed(callback, code),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ConnectCredentialMintError({ reason: "callback_listener_failed", cause }),
          ),
        ),
      );
      const authorizeUrl = buildConnectAuthorizeRequestUrl({
        hostedAppUrl,
        state,
        challenge,
        loopbackPort: metadata.loopbackPort,
      });
      yield* input.launchBrowser(authorizeUrl).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Could not open the T3 Connect sign-in in a browser", { cause }),
        ),
      );
      const code = yield* Deferred.await(callback).pipe(
        Effect.timeout(input.timeout),
        Effect.catchTag("TimeoutError", (cause) => fail("browser_callback_timeout", cause)),
      );
      const token = yield* exchangeLoopbackAuthorizationCode({
        metadata,
        code,
        codeVerifier: verifier,
      }).pipe(
        Effect.mapError(
          (cause) => new ConnectCredentialMintError({ reason: "token_exchange_failed", cause }),
        ),
      );
      yield* input.store(token).pipe(
        Effect.mapError(
          (cause) => new ConnectCredentialMintError({ reason: "credential_store_failed", cause }),
        ),
      );
      yield* Effect.logInfo("Minted the in-app T3 Connect credential");
    }),
  );
});
