import type { AccountStatus } from "@t3tools/contracts";
import type { AccountDefinition } from "@t3team/pack-api";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import type * as ExternalLauncher from "../process/externalLauncher.ts";
import { NO_BROWSER, runAccountBrowserSignIn } from "./t3team-AccountBrowserSignIn.ts";
import { AccountError } from "./t3team-AccountError.ts";
import { makeAccountOAuthClient } from "./t3team-AccountOAuth.ts";
import { makeAccountTokenStore } from "./t3team-AccountTokenStore.ts";

/**
 * One account's sign-in. Two ways in run at once and the first to finish wins: the browser
 * sign-in (`t3team-AccountBrowserSignIn` — completes on its own when the browser is already signed
 * in to the issuer) and, when the issuer offers it, the device code (a short code entered from any
 * browser, for a server that cannot open one). `t3team-AccountTokenStore` keeps what it yields.
 */

/** How long a browser-only sign-in waits when there is no device code to set the deadline. */
const BROWSER_ONLY_TIMEOUT = Duration.minutes(10);

type Pending = {
  readonly userCode: string | null;
  readonly verificationUri: string | null;
  readonly expiresAtMs: number;
  readonly fiber: Fiber.Fiber<void>;
};

export const makeAccountSession = Effect.fn("account.session.make")(function* (
  account: AccountDefinition,
  deps: {
    readonly secrets: ServerSecretStore.ServerSecretStore["Service"];
    readonly http: HttpClient.HttpClient;
    readonly launcher: ExternalLauncher.ExternalLauncher["Service"];
    readonly crypto: Crypto.Crypto;
  },
) {
  const signInRequired = (message = `Sign in to ${account.label} to continue.`) =>
    new AccountError({ reason: "sign_in_required", message });
  const oauth = makeAccountOAuthClient(account, deps.http);
  const pending = yield* Ref.make(Option.none<Pending>());
  const tokens = yield* makeAccountTokenStore(account.id, deps.secrets);
  const lastError = yield* Ref.make<string | null>(null);
  /** Bumped by every sign-out: a flow that started before it can never store tokens after it. */
  const generation = yield* Ref.make(0);
  const refreshLock = yield* Semaphore.make(1);

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

  const signIn: Effect.Effect<AccountStatus, AccountError> = Effect.gen(function* () {
    if (Option.isSome(yield* Ref.get(pending))) return yield* status;
    const code = yield* Option.match(oauth.requestDeviceCode, {
      onNone: () => Effect.succeed(null),
      onSome: (request) =>
        request.pipe(
          Effect.mapError(
            () =>
              new AccountError({
                reason: "unavailable",
                message: `Could not reach the ${account.label} sign-in. Check your connection and try again.`,
              }),
          ),
        ),
    });
    const startedIn = yield* Ref.get(generation);
    yield* Ref.set(lastError, null);
    const timeout = code === null ? BROWSER_ONLY_TIMEOUT : Duration.seconds(code.expires_in);
    const browser = runAccountBrowserSignIn({
      label: account.label,
      oauth,
      launchBrowser: deps.launcher.launchBrowser,
      timeout,
    }).pipe(Effect.provideService(Crypto.Crypto, deps.crypto));
    // With a device code, it decides the end: the browser failing (no browser here, declined,
    // blocked by policy) is shown but never ends the attempt, the code keeps working. Without one,
    // the browser is the attempt.
    const attempt =
      code === null
        ? browser
        : Effect.raceFirst(
            oauth.pollDeviceToken(code),
            browser.pipe(
              Effect.tapError((reason) =>
                reason === NO_BROWSER
                  ? Effect.logInfo("account browser sign-in unavailable", { account: account.id })
                  : Ref.set(lastError, reason),
              ),
              Effect.catch(() => Effect.never),
            ),
          );
    const fiber = yield* attempt.pipe(
      Effect.flatMap((granted) =>
        Effect.gen(function* () {
          if ((yield* Ref.get(generation)) === startedIn) {
            yield* tokens.store(account.signInResource, granted);
          }
        }),
      ),
      Effect.catch((message) => Ref.set(lastError, message)),
      Effect.ensuring(Ref.set(pending, Option.none())),
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
    return yield* status;
  });

  const signOut: Effect.Effect<void> = Effect.gen(function* () {
    yield* Ref.update(generation, (n) => n + 1);
    const waiting = yield* Ref.getAndSet(pending, Option.none());
    if (Option.isSome(waiting)) yield* Fiber.interrupt(waiting.value.fiber);
    yield* tokens.clear;
  });

  const accessToken = (resource: string): Effect.Effect<string, AccountError> =>
    Effect.gen(function* () {
      if (!Object.hasOwn(account.resources, resource)) {
        return yield* new AccountError({
          reason: "unavailable",
          message: `${account.label} has no resource named ${resource}.`,
        });
      }
      const hit = yield* tokens.fresh(resource);
      if (Option.isSome(hit)) return hit.value;
      // One refresh at a time: two concurrent refreshes with one rotating grant would make the loser
      // look "rejected" and sign the user out right after the winner stored the new grant.
      return yield* refreshLock.withPermits(1)(
        Effect.gen(function* () {
          const raced = yield* tokens.fresh(resource);
          if (Option.isSome(raced)) return raced.value;
          const refresh = yield* tokens.grant;
          if (Option.isNone(refresh)) return yield* signInRequired();
          const before = yield* Ref.get(generation);
          const granted = yield* oauth.refresh(refresh.value, resource).pipe(
            Effect.catch((failure) =>
              failure === "unreachable"
                ? Effect.fail(
                    new AccountError({
                      reason: "unavailable",
                      message: `Could not reach the ${account.label} sign-in.`,
                    }),
                  )
                : // The grant is spent or revoked: self-heal into "sign in again".
                  signOut.pipe(
                    Effect.flatMap(() =>
                      Effect.fail(
                        signInRequired(`Your ${account.label} sign-in expired. Sign in again.`),
                      ),
                    ),
                  ),
            ),
          );
          if ((yield* Ref.get(generation)) !== before) return yield* signInRequired();
          return yield* tokens.store(resource, granted);
        }),
      );
    });

  return { account, status, signIn, signOut, accessToken } as const;
});

export type AccountSession = Effect.Success<ReturnType<typeof makeAccountSession>>;
