import { type CloudBrokerStatus, CloudSessionFailedError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/unstable/http/HttpClient";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { type NexiBrokerConfig, resolveNexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";
import { type Tokens, makeEntraClient } from "./t3team-NexiBrokerEntra.ts";

/**
 * The user's Entra sign-in for the Nexi broker: device code, so nothing listens on localhost — the
 * user enters a short code on microsoft.com from any browser while this server polls. The refresh
 * token lives in this install's secret store; access tokens are cached in memory.
 */

const REFRESH_TOKEN_SECRET = "nexi-broker-refresh-token";
/** Refresh this long before Entra's stated expiry, so a token never dies mid-request. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

interface CachedAccess {
  readonly token: string;
  readonly expiresAtMs: number;
  readonly name: string | null;
}
type Pending = {
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresAtMs: number;
  readonly fiber: Fiber.Fiber<void>;
};

/** Display name from the token payload; the token itself is verified by the broker, not here. */
const nameOf = (token: string): string | null => {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    return typeof payload.name === "string" ? payload.name : null;
  } catch {
    return null;
  }
};

const signInRequired = (message = "Sign in to Nexplore to use cloud sessions.") =>
  new CloudSessionFailedError({ reason: "broker_sign_in_required", message });
const unavailable = (message: string) =>
  new CloudSessionFailedError({ reason: "broker_unavailable", message });
const NOT_CONFIGURED = "This build has no Nexi broker configured.";

export class NexiBrokerAuth extends Context.Service<
  NexiBrokerAuth,
  {
    readonly config: Option.Option<NexiBrokerConfig>;
    readonly status: Effect.Effect<CloudBrokerStatus>;
    /** Starts a device-code sign-in (or reports the one already waiting for the user). */
    readonly signIn: Effect.Effect<CloudBrokerStatus, CloudSessionFailedError>;
    /** Forgets the sign-in, including one still waiting for its code. */
    readonly signOut: Effect.Effect<void>;
    /** A live access token for the broker, refreshed as needed. */
    readonly accessToken: Effect.Effect<string, CloudSessionFailedError>;
  }
>()("t3/cloud/t3team-NexiBrokerAuth/NexiBrokerAuth") {}

const make = Effect.fn("cloud.broker.auth.make")(function* () {
  const config = yield* resolveNexiBrokerConfig();
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const http = yield* HttpClient.HttpClient;
  const entra = Option.map(config, (cfg) => makeEntraClient(cfg, http));
  const pending = yield* Ref.make(Option.none<Pending>());
  const cached = yield* Ref.make(Option.none<CachedAccess>());
  const lastError = yield* Ref.make<string | null>(null);
  /** Bumped by every sign-out: a poll that started before it can never store tokens after it. */
  const generation = yield* Ref.make(0);
  const refreshLock = yield* Semaphore.make(1);

  const storeTokens = Effect.fn("cloud.broker.auth.store")(function* (body: Tokens) {
    if (body.refresh_token) {
      const bytes = new TextEncoder().encode(body.refresh_token);
      yield* secrets.set(REFRESH_TOKEN_SECRET, bytes).pipe(Effect.orDie);
    }
    const expiresAtMs = (yield* Clock.currentTimeMillis) + body.expires_in * 1000;
    const access = { token: body.access_token, expiresAtMs, name: nameOf(body.access_token) };
    yield* Ref.set(cached, Option.some(access));
    return access;
  });

  const refreshToken = secrets.get(REFRESH_TOKEN_SECRET).pipe(
    Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes))),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

  const status: NexiBrokerAuth["Service"]["status"] = Effect.gen(function* () {
    const base = { enabled: Option.isSome(config), lastError: yield* Ref.get(lastError) };
    const waiting = yield* Ref.get(pending);
    if (Option.isSome(waiting)) {
      const { userCode, verificationUri, expiresAtMs } = waiting.value;
      return {
        ...base,
        auth: { _tag: "SigningIn" as const, userCode, verificationUri, expiresAtMs },
      };
    }
    const access = yield* Ref.get(cached);
    if (Option.isNone(access) && Option.isNone(yield* refreshToken)) {
      return { ...base, auth: { _tag: "SignedOut" as const } };
    }
    const name = Option.isSome(access) ? access.value.name : null;
    return { ...base, auth: { _tag: "SignedIn" as const, name } };
  });

  const signIn: NexiBrokerAuth["Service"]["signIn"] = Effect.gen(function* () {
    if (Option.isNone(entra)) return yield* unavailable(NOT_CONFIGURED);
    if (Option.isSome(yield* Ref.get(pending))) return yield* status;
    const code = yield* entra.value.requestDeviceCode.pipe(
      Effect.mapError(() =>
        unavailable("Could not reach Microsoft sign-in. Check your connection and try again."),
      ),
    );
    const startedIn = yield* Ref.get(generation);
    yield* Ref.set(lastError, null);
    const fiber = yield* entra.value.pollDeviceToken(code).pipe(
      Effect.flatMap((tokens) =>
        Effect.gen(function* () {
          if ((yield* Ref.get(generation)) === startedIn) yield* storeTokens(tokens);
        }),
      ),
      Effect.catch((message) => Ref.set(lastError, message)),
      Effect.ensuring(Ref.set(pending, Option.none())),
      Effect.forkDetach,
    );
    const expiresAtMs = (yield* Clock.currentTimeMillis) + code.expires_in * 1000;
    yield* Ref.set(
      pending,
      Option.some({
        userCode: code.user_code,
        verificationUri: code.verification_uri,
        expiresAtMs,
        fiber,
      }),
    );
    return yield* status;
  });

  const signOut: NexiBrokerAuth["Service"]["signOut"] = Effect.gen(function* () {
    yield* Ref.update(generation, (n) => n + 1);
    const waiting = yield* Ref.getAndSet(pending, Option.none());
    if (Option.isSome(waiting)) yield* Fiber.interrupt(waiting.value.fiber);
    yield* secrets.remove(REFRESH_TOKEN_SECRET).pipe(Effect.ignore);
    yield* Ref.set(cached, Option.none());
  });

  const fresh = Effect.gen(function* () {
    const access = yield* Ref.get(cached);
    const now = yield* Clock.currentTimeMillis;
    return Option.filter(access, (a) => a.expiresAtMs - EXPIRY_MARGIN_MS > now);
  });

  const accessToken: NexiBrokerAuth["Service"]["accessToken"] = Effect.gen(function* () {
    if (Option.isNone(entra)) return yield* unavailable(NOT_CONFIGURED);
    const hit = yield* fresh;
    if (Option.isSome(hit)) return hit.value.token;
    // One refresh at a time: two concurrent refreshes with one rotating token would make the loser
    // look "rejected" and sign the user out right after the winner stored the new token.
    return yield* refreshLock.withPermits(1)(
      Effect.gen(function* () {
        const raced = yield* fresh;
        if (Option.isSome(raced)) return raced.value.token;
        const refresh = yield* refreshToken;
        if (Option.isNone(refresh)) return yield* signInRequired();
        const before = yield* Ref.get(generation);
        const tokens = yield* entra.value.refresh(refresh.value).pipe(
          Effect.catch((failure) =>
            failure === "unreachable"
              ? Effect.fail(unavailable("Could not reach Microsoft sign-in."))
              : // The refresh token is spent or revoked: self-heal into "sign in again".
                signOut.pipe(
                  Effect.flatMap(() =>
                    Effect.fail(signInRequired("Your Nexplore sign-in expired. Sign in again.")),
                  ),
                ),
          ),
        );
        if ((yield* Ref.get(generation)) !== before) return yield* signInRequired();
        return (yield* storeTokens(tokens)).token;
      }),
    );
  });

  return { config, status, signIn, signOut, accessToken } as const;
});

export const layer = Layer.effect(NexiBrokerAuth, make());
