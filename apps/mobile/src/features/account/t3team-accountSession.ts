import { AccountError, type AccountStatus } from "@t3tools/contracts";
import { makeAccountOAuthClient } from "@t3tools/shared/t3team-accountOAuth";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type * as HttpClient from "effect/http/HttpClient";

import { makeAccessTokens } from "./t3team-accountAccessToken";
import { type OpenAuthSession, runAccountBrowserSignIn } from "./t3team-accountBrowserSignIn";
import {
  type MobileAccountDefinition,
  type SignInMethod,
  signInMethods,
} from "./t3team-accountIssuer";
import { type AccountSecretStorage, makeAccountTokenStore } from "./t3team-accountTokenStore";

/**
 * The app's sign-in to one account (`defineAccount`), in the same `AccountStatus` shape the
 * server's `/api/t3team/accounts` routes serve. Two ways in, each an explicit choice: the browser
 * (auth session + PKCE, when the issuer has the app's redirect registered) and the device code (a
 * short code entered at the issuer's page, which works without any redirect). `subscribe` /
 * `snapshot` feed the UI.
 */

const BROWSER_ONLY_TIMEOUT = Duration.minutes(10);

type Pending = {
  readonly userCode: string | null;
  readonly verificationUri: string | null;
  readonly expiresAtMs: number;
  readonly fiber: Fiber.Fiber<void>;
};

export const makeAccountSession = Effect.fn("mobile.account.session.make")(function* (
  account: MobileAccountDefinition,
  deps: {
    readonly http: HttpClient.HttpClient;
    readonly secrets: AccountSecretStorage;
    readonly crypto: Crypto.Crypto;
    readonly openAuthSession: OpenAuthSession;
  },
) {
  const oauth = makeAccountOAuthClient(account, deps.http);
  const pending = yield* Ref.make(Option.none<Pending>());
  const tokens = yield* makeAccountTokenStore(account.id, deps.secrets);
  const lastError = yield* Ref.make<string | null>(null);
  /** Bumped by every sign-out: a flow that started before it can never store tokens after it. */
  const generation = yield* Ref.make(0);
  const listeners = new Set<() => void>();

  const status: Effect.Effect<AccountStatus> = Effect.gen(function* () {
    const base = { id: account.id, label: account.label, lastError: yield* Ref.get(lastError) };
    const waiting = yield* Ref.get(pending);
    if (Option.isSome(waiting)) {
      const { userCode, verificationUri, expiresAtMs } = waiting.value;
      return { ...base, auth: { _tag: "SigningIn", userCode, verificationUri, expiresAtMs } };
    }
    if (!(yield* tokens.signedIn)) return { ...base, auth: { _tag: "SignedOut" } };
    return { ...base, auth: { _tag: "SignedIn", name: yield* tokens.name } };
  });
  let current: AccountStatus = yield* status;
  const publish = Effect.gen(function* () {
    current = yield* status;
    for (const listener of listeners) listener();
  });

  const unavailable = () =>
    new AccountError({
      reason: "unavailable",
      message: `Could not reach the ${account.label} sign-in. Check your connection and try again.`,
    });

  const notOffered = (method: SignInMethod) =>
    new AccountError({
      reason: "unavailable",
      message:
        method === "browser"
          ? "Browser sign-in is not set up in this build. Use a sign-in code instead."
          : `The ${account.label} issuer offers no sign-in code.`,
    });

  /** The method's own attempt: the browser round trip, or polling the code the issuer handed out. */
  const startAttempt = (method: SignInMethod) =>
    Effect.gen(function* () {
      if (method === "browser") {
        if (account.redirectUri === null) return yield* Effect.fail(notOffered(method));
        const attempt = runAccountBrowserSignIn({
          oauth,
          redirectUri: account.redirectUri,
          openAuthSession: deps.openAuthSession,
        }).pipe(Effect.provideService(Crypto.Crypto, deps.crypto));
        return { code: null, attempt, timeout: BROWSER_ONLY_TIMEOUT };
      }
      if (Option.isNone(oauth.requestDeviceCode)) return yield* Effect.fail(notOffered(method));
      const code = yield* oauth.requestDeviceCode.value.pipe(Effect.mapError(unavailable));
      return {
        code,
        attempt: oauth.pollDeviceToken(code),
        timeout: Duration.seconds(code.expires_in),
      };
    });

  const signIn = (method: SignInMethod): Effect.Effect<AccountStatus, AccountError> =>
    Effect.gen(function* () {
      if (Option.isSome(yield* Ref.get(pending))) return yield* status;
      const { code, attempt, timeout } = yield* startAttempt(method);
      const startedIn = yield* Ref.get(generation);
      yield* Ref.set(lastError, null);
      const fiber = yield* attempt.pipe(
        Effect.flatMap((granted) =>
          Effect.gen(function* () {
            if ((yield* Ref.get(generation)) === startedIn) {
              yield* tokens.store(account.signInResource, granted);
            }
          }),
        ),
        Effect.catch((message) => Ref.set(lastError, message)),
        Effect.ensuring(Ref.set(pending, Option.none()).pipe(Effect.andThen(publish))),
        Effect.forkDetach,
      );
      const now = yield* Clock.currentTimeMillis;
      yield* Ref.set(
        pending,
        Option.some({
          userCode: code?.user_code ?? null,
          verificationUri: code?.verification_uri ?? null,
          expiresAtMs: now + Duration.toMillis(timeout),
          fiber,
        }),
      );
      yield* publish;
      return current;
    });

  const signOut: Effect.Effect<void> = Effect.gen(function* () {
    yield* Ref.update(generation, (n) => n + 1);
    const waiting = yield* Ref.getAndSet(pending, Option.none());
    if (Option.isSome(waiting)) yield* Fiber.interrupt(waiting.value.fiber);
    yield* tokens.clear;
    yield* publish;
  });

  const accessToken = makeAccessTokens({ account, oauth, tokens, generation, signOut, publish });

  return {
    account,
    methods: signInMethods(account),
    status,
    signIn,
    signOut,
    accessToken,
    snapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  } as const;
});

export type AccountSession = Effect.Success<ReturnType<typeof makeAccountSession>>;
