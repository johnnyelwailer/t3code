import { type AccountOAuthClient, makePkceRequest } from "@t3tools/shared/t3team-accountOAuth";
import * as Effect from "effect/Effect";

/**
 * The browser half of the app's account sign-in: authorization code + PKCE in the system's auth
 * session (ASWebAuthenticationSession / Custom Tabs), which shares the browser's Microsoft cookies,
 * so a phone already signed in to Entra completes with one tap. The issuer redirects the code to
 * the app's own scheme; the verifier never leaves the app, so an intercepted code is useless.
 */

/** What the system auth session returned: the redirect it caught, or that the user left. */
export type AuthSessionOutcome =
  | { readonly type: "success"; readonly url: string }
  | { readonly type: "cancel" | "dismiss" | "locked" | "opened" };

export type OpenAuthSession = (
  authorizeUrl: string,
  redirectUri: string,
) => Effect.Effect<AuthSessionOutcome>;

export const BROWSER_CANCELLED = "The browser sign-in was cancelled.";

/** Fails with a user-facing message; the device code (when offered) keeps running beside it. */
export const runAccountBrowserSignIn = (input: {
  readonly oauth: AccountOAuthClient;
  readonly redirectUri: string;
  readonly openAuthSession: OpenAuthSession;
}) =>
  Effect.gen(function* () {
    const { verifier, challenge, state } = yield* makePkceRequest.pipe(
      Effect.mapError(() => "Could not prepare the browser sign-in."),
    );
    const outcome = yield* input.openAuthSession(
      input.oauth.authorizeUrl({ redirectUri: input.redirectUri, challenge, state }),
      input.redirectUri,
    );
    if (outcome.type !== "success") return yield* Effect.fail(BROWSER_CANCELLED);
    const callback = new URL(outcome.url);
    if (callback.searchParams.get("state") !== state) {
      return yield* Effect.fail("The browser sign-in answered a different request. Try again.");
    }
    const code = callback.searchParams.get("code");
    if (code === null) {
      return yield* Effect.fail(
        callback.searchParams.get("error_description") ??
          callback.searchParams.get("error") ??
          BROWSER_CANCELLED,
      );
    }
    return yield* input.oauth.exchangeCode({ code, verifier, redirectUri: input.redirectUri });
  });
