// @effect-diagnostics nodeBuiltinImport:off - The loopback callback is a Node HTTP boundary.
import * as NodeHttp from "node:http";

import type { ExternalLauncherError } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { makePkceRequest } from "../cloud/t3team-ConnectBrowserRoundTrip.ts";
import type { AccountOAuthClient } from "./t3team-AccountOAuth.ts";

/**
 * The browser half of an account sign-in: authorization code + PKCE through the user's default
 * browser, with the code redirected to a one-shot listener on this machine's loopback. A browser
 * that is already signed in to the issuer completes it without a prompt, so the user sees a window
 * open and close. `t3team-AccountSession` races it against the device code, which stays the way in
 * for a server with no browser (a VM, a remote host).
 *
 * The listener answers one request and only on 127.0.0.1 / ::1; the verifier never leaves this
 * process, so an intercepted code is useless elsewhere.
 */

type Callback = { readonly code: string } | { readonly error: string };

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const page = (title: string, heading: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:15px system-ui;margin:4rem auto;max-width:28rem;text-align:center">
<h1 style="font-size:1.2rem">${heading}</h1>
<p>${body}</p>`;
const donePage = (label: string) =>
  page(
    "Signed in",
    `You're signed in to ${escapeHtml(label)}`,
    "Return to the app. You can close this window.",
  );
const failedPage = (label: string) =>
  page(
    "Not signed in",
    `The ${escapeHtml(label)} sign-in did not finish`,
    "Return to the app to see why and try again. You can close this window.",
  );

/** The browser could not be opened here (a VM, a remote host): expected, the device code covers it. */
export const NO_BROWSER = "Could not open a browser on this machine.";

const listen = (server: NodeHttp.Server, port: number, host: string) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : port);
    });
  });

/** A loopback listener for one redirect; `localhost` may resolve to either address family. */
const loopback = (state: string, label: string) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        let deliver: (callback: Callback) => void = () => {};
        const callback = new Promise<Callback>((resolve) => (deliver = resolve));
        const handler: NodeHttp.RequestListener = (request, response) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (url.pathname !== "/" || url.searchParams.get("state") !== state) {
            response.writeHead(404).end();
            return;
          }
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
          response
            .writeHead(200, { "content-type": "text/html; charset=utf-8" })
            .end(code ? donePage(label) : failedPage(label));
          deliver(code ? { code } : { error: error ?? "The sign-in was cancelled." });
        };
        const v4 = NodeHttp.createServer(handler);
        const port = await listen(v4, 0, "127.0.0.1");
        const v6 = NodeHttp.createServer(handler);
        // Best effort: a machine without IPv6 loopback still has the IPv4 listener.
        await listen(v6, port, "::1").catch(() => undefined);
        return { port, callback, servers: [v4, v6] };
      },
      catch: () => "Could not start the sign-in listener on this machine.",
    }),
    ({ servers }) => Effect.sync(() => servers.forEach((server) => server.close())),
  );

/** Fails with a user-facing message; the device code keeps running beside it either way. */
export const runAccountBrowserSignIn = (input: {
  readonly label: string;
  readonly oauth: AccountOAuthClient;
  readonly launchBrowser: (url: string) => Effect.Effect<void, ExternalLauncherError>;
  readonly timeout: Duration.Duration;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { verifier, challenge, state } = yield* makePkceRequest.pipe(
        Effect.mapError(() => "Could not prepare the browser sign-in."),
      );
      const { port, callback } = yield* loopback(state, input.label);
      const redirectUri = `http://localhost:${port}`;
      yield* input
        .launchBrowser(input.oauth.authorizeUrl({ redirectUri, challenge, state }))
        .pipe(Effect.mapError(() => NO_BROWSER));
      const result = yield* Effect.promise(() => callback).pipe(
        Effect.timeoutOrElse({
          duration: input.timeout,
          orElse: () => Effect.fail("The browser sign-in did not finish in time."),
        }),
      );
      if ("error" in result) return yield* Effect.fail(result.error);
      return yield* input.oauth.exchangeCode({ code: result.code, verifier, redirectUri });
    }),
  );
