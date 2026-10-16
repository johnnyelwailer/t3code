import { AccountError, type AccountStatus } from "@t3tools/contracts";
import type { NexiBrokerClient } from "@t3tools/shared/t3team-nexiBrokerClient";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as Option from "effect/Option";
import * as WebBrowser from "expo-web-browser";

import { runtime } from "../../lib/runtime";
import { resolveNexiDistributionConfig } from "../distribution/t3team-nexiDistributionConfig";
import type { AuthSessionOutcome, OpenAuthSession } from "./t3team-accountBrowserSignIn";
import {
  defaultSignInMethod,
  resolveMobileAccount,
  type SignInMethod,
  signInMethods,
} from "./t3team-accountIssuer";
import { accountSecureStorage } from "./t3team-accountSecureStorage";
import { type AccountSession, makeAccountSession } from "./t3team-accountSession";
import { makeMobileNexiBroker } from "./t3team-nexiBroker";

/**
 * The app's one account session, bound to the app runtime (HTTP, crypto), the keychain and the
 * system browser. Created on first use; `useAccountStatus` and the broker client read it here.
 */

const openAuthSession: OpenAuthSession = (authorizeUrl, redirectUri) =>
  Effect.promise(() => WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri)).pipe(
    Effect.map((result): AuthSessionOutcome =>
      result.type === "success" ? { type: "success", url: result.url } : { type: "closed" },
    ),
  );

let session: Promise<AccountSession> | null = null;
let ready: AccountSession | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const accountSession = (): Promise<AccountSession> => {
  session ??= runtime
    .runPromise(
      Effect.gen(function* () {
        return yield* makeAccountSession(resolveMobileAccount().account, {
          http: yield* HttpClient.HttpClient,
          secrets: accountSecureStorage,
          crypto: yield* Crypto.Crypto,
          openAuthSession,
        });
      }),
    )
    .then((created) => {
      ready = created;
      created.subscribe(notify);
      notify();
      return created;
    });
  return session;
};

export const accountStatusSnapshot = (): AccountStatus | null => ready?.snapshot() ?? null;

export const subscribeAccountStatus = (listener: () => void) => {
  listeners.add(listener);
  void accountSession();
  return () => void listeners.delete(listener);
};

/** Which sign-in methods this build offers: the browser by default, the code as the alternative. */
export const accountSignInMethods = () => signInMethods(resolveMobileAccount().account);

/**
 * The one tap: starts the browser sign-in on this phone. The code (for signing in on another
 * device) is an explicit `"code"` choice, and the default only for a build without the browser
 * sign-in; either way nothing opens the code page on this phone.
 */
export const startAccountSignIn = async (method?: SignInMethod): Promise<AccountError | null> => {
  const current = await accountSession();
  const chosen = method ?? defaultSignInMethod(current.methods);
  if (chosen === null) {
    return new AccountError({
      reason: "unavailable",
      message: "Sign-in is not set up in this build.",
    });
  }
  const result = await runtime.runPromise(Effect.result(current.signIn(chosen)));
  return result._tag === "Failure" ? result.failure : null;
};

/** Cancels a pending sign-in or signs out; either way the stored grant is gone. */
export const signOutAccount = async () => {
  const current = await accountSession();
  await runtime.runPromise(current.signOut);
};

/** A token for `resource` (e.g. `"broker"`), refreshed from the stored grant when needed. */
export const accountAccessToken = (resource: string) =>
  Effect.promise(accountSession).pipe(Effect.flatMap((current) => current.accessToken(resource)));

let broker: Promise<Option.Option<NexiBrokerClient>> | null = null;

/** The Nexi broker signed in as this account; `None` for a build with no broker URL. */
export const nexiBroker = (): Promise<Option.Option<NexiBrokerClient>> => {
  broker ??= runtime.runPromise(
    makeMobileNexiBroker({
      url: resolveNexiDistributionConfig().broker.url,
      accessToken: accountAccessToken,
    }),
  );
  return broker;
};
