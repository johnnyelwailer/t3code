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
  | { readonly type: "closed" };

export type OpenAuthSession = (
  authorizeUrl: string,
  redirectUri: string,
) => Effect.Effect<AuthSessionOutcome>;

/** A closed browser is often Microsoft's own error page for an unregistered redirect address. */
export const browserNotFinished = (redirectUri: string) =>
  `The browser sign-in did not finish. If Microsoft showed an error, this app's sign-in address (${redirectUri}) may not be registered yet.`;

const firstLine = (text: string) => text.slice(0, 160).split(String.fromCharCode(10), 1)[0]!.trim();

export const browserDeclined = (callback: URL) => {
  const reason =
    callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
  return reason === null
    ? "Microsoft declined the sign-in."
    : `Microsoft declined the sign-in: ${firstLine(reason)}`;
};

/** Fails with a user-facing message. */
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
    if (outcome.type !== "success")
      return yield* Effect.fail(browserNotFinished(input.redirectUri));
    const callback = new URL(outcome.url);
    if (callback.searchParams.get("state") !== state) {
      return yield* Effect.fail("The browser sign-in answered a different request. Try again.");
    }
    const code = callback.searchParams.get("code");
    if (code === null) return yield* Effect.fail(browserDeclined(callback));
    return yield* input.oauth.exchangeCode({ code, verifier, redirectUri: input.redirectUri });
  });
