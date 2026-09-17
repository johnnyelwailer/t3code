import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as ConfigProvider from "effect/ConfigProvider";
import * as HttpClient from "effect/unstable/http/HttpClient";

import * as ExternalLauncher from "../process/externalLauncher.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import { runConnectBrowserRoundTrip } from "./t3team-ConnectBrowserRoundTrip.ts";
import {
  ConnectCredentialMintError,
  isConnectCredentialMintError,
} from "./t3team-ConnectCredentialMintError.ts";

/**
 * The in-app, per-user T3 Connect credential mint — the creator-side half of
 * the cloud-session credential handoff.
 *
 * Today the ONLY producer of the `cloud-cli-oauth-token` secret is the CLI's
 * terminal loopback PKCE flow. A user who links their environment to the
 * cloud from the app has no such flow, so `cloud.session.create` dead-ends at
 * `connect_sign_in_required`. This closes that loop with ZERO manual steps:
 * the server generates PKCE, opens the user's default browser to the hosted
 * /connect page (which redirects the code straight to the 127.0.0.1
 * listener — the loopback round-trip the hosted service already supports),
 * and stores the result in the SAME secret the CLI flow writes, so every
 * existing consumer (handoff, reconcile, VM refresh) keeps working
 * unchanged.
 *
 * The credential is per-user by construction: the PKCE round-trip runs in
 * THIS user's browser against THEIR Clerk identity, into THIS install's
 * secrets directory. There is no shared or fleet credential anywhere.
 */

/** How long a mint may wait for the browser round-trip before giving up. */
export const CONNECT_MINT_DEFAULT_TIMEOUT = Duration.minutes(10);

export class ConnectCredentialMinter extends Context.Service<
  ConnectCredentialMinter,
  {
    /**
     * Ensure this install's per-user T3 Connect credential exists and is fresh.
     *
     * - A usable stored credential → succeeds immediately, no browser involved
     *   (the manager's refresh-5-minutes-early keeps a live credential alive).
     * - Otherwise starts (or joins, when one is already running) a browser
     *   round-trip and waits at most `timeout` for it.
     */
    readonly mint: (input?: {
      readonly timeout?: Duration.Duration;
    }) => Effect.Effect<void, ConnectCredentialMintError>;
  }
>()("t3/cloud/t3team-ConnectCredentialMinter/ConnectCredentialMinter") {}

export const make = Effect.gen(function* () {
  const cloudCli = yield* CliTokenManager.CloudCliTokenManager;
  const externalLauncher = yield* ExternalLauncher.ExternalLauncher;
  // The round-trip reads its config provider, crypto, and http client from
  // its own ambient context; capture them here so the mint effect itself
  // stays requirement-free and its surface type carries no hidden services.
  const configProvider = yield* ConfigProvider.ConfigProvider;
  const crypto = yield* Crypto.Crypto;
  const httpClient = yield* HttpClient.HttpClient;
  // The one shared in-flight browser round-trip: concurrent mints (top-up
  // timer + cloud.session.create) must not open two sign-ins at once.
  const inFlight = yield* Ref.make<
    Option.Option<Deferred.Deferred<void, ConnectCredentialMintError>>
  >(Option.none());

  const waitWithin = (
    deferred: Deferred.Deferred<void, ConnectCredentialMintError>,
    timeout: Duration.Duration,
  ) =>
    Deferred.await(deferred).pipe(
      Effect.timeout(timeout),
      Effect.catchTag(
        "TimeoutError",
        (cause) =>
          Effect.fail(
            new ConnectCredentialMintError({ reason: "browser_callback_timeout", cause }),
          ),
      ),
    );

  const mint: ConnectCredentialMinter["Service"]["mint"] = (input) => {
    const timeout = input?.timeout ?? CONNECT_MINT_DEFAULT_TIMEOUT;
    return Effect.gen(function* () {
      // A usable credential short-circuits: no browser, no round-trip. A
      // stored credential that cannot be read or refreshed counts as absent —
      // the remediation (a fresh sign-in) is the same either way.
      const existing = yield* cloudCli.getExisting.pipe(
        Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
      );
      if (Option.isSome(existing)) return;

      const deferred = yield* Deferred.make<void, ConnectCredentialMintError>();
      // Ref.modify's callback returns [result, nextValue] in this Effect version
      // (result FIRST). Result = the slot someone was already holding, if any:
      // `none` means we claimed it and own the round-trip; `some` means ride
      // the in-flight one instead of opening a second sign-in.
      const slot = yield* Ref.modify(
        inFlight,
        (current): [
          Option.Option<Deferred.Deferred<void, ConnectCredentialMintError>>,
          Option.Option<Deferred.Deferred<void, ConnectCredentialMintError>>,
        ] => (Option.isSome(current) ? [current, current] : [Option.none(), Option.some(deferred)]),
      );
      if (Option.isSome(slot)) {
        // Someone else owns the browser round-trip; ride it out with our own
        // bounded wait instead of opening a second sign-in.
        yield* waitWithin(slot.value, timeout);
        return;
      }

      const attempt = runConnectBrowserRoundTrip({
        timeout,
        launchBrowser: externalLauncher.launchBrowser,
        store: cloudCli.store,
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(HttpClient.HttpClient, httpClient),
        // Anything that is not already a structured mint failure is an
        // environment problem (no OAuth config on this build, a socket bind
        // failure, …): a mint is structurally impossible, so say so instead
        // of leaking a raw error to the surface. Mapped BEFORE settling the
        // shared deferred, which carries only structured mint errors.
        Effect.mapError((error) =>
          isConnectCredentialMintError(error)
            ? error
            : new ConnectCredentialMintError({ reason: "connect_unavailable", cause: error }),
        ),
        Effect.ensuring(Ref.set(inFlight, Option.none())),
      );

      // Settle the shared deferred from the outcome, then surface it to this
      // caller too: joiners ride the deferred, the originator re-throws.
      const outcome = yield* attempt.pipe(Effect.result);
      yield* outcome._tag === "Success"
        ? Deferred.succeed(deferred, undefined).pipe(Effect.asVoid)
        : Deferred.fail(deferred, outcome.failure);
      return yield* outcome._tag === "Success" ? Effect.void : Effect.fail(outcome.failure);
    });
  };

  return ConnectCredentialMinter.of({ mint });
});

export const layer = Layer.effect(ConnectCredentialMinter, make).pipe(
  Layer.provide(CliTokenManager.layer),
  Layer.provide(ExternalLauncher.layer),
);
