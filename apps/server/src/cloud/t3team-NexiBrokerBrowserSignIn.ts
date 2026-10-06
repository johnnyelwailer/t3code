// @effect-diagnostics nodeBuiltinImport:off - The loopback callback is a Node HTTP boundary.
import * as NodeHttp from "node:http";

import type { ExternalLauncherError } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { makePkceRequest } from "./t3team-ConnectBrowserRoundTrip.ts";
import type { makeEntraClient } from "./t3team-NexiBrokerEntra.ts";

/**
 * The browser half of the Nexi broker sign-in (issue #556): Entra authorization code + PKCE through
 * the user's default browser, with the code redirected to a one-shot listener on this machine's
 * loopback. A browser that is already signed in to Microsoft completes it without a prompt, so the
 * user sees a window open and close. `t3team-NexiBrokerAuth` races it against the device code, which
 * stays the way in for a server with no browser (a VM, a remote host).
 *
 * The listener answers one request and only on 127.0.0.1 / ::1; the verifier never leaves this
 * process, so an intercepted code is useless elsewhere.
 */

type EntraClient = ReturnType<typeof makeEntraClient>;
type Callback = { readonly code: string } | { readonly error: string };

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Signed in</title>
<body style="font:15px system-ui;margin:4rem auto;max-width:28rem;text-align:center">
<h1 style="font-size:1.2rem">You're signed in to Nexplore</h1>
<p>Return to Nexi Work. You can close this window.</p>`;

const FAILED_PAGE = `<!doctype html><meta charset="utf-8"><title>Not signed in</title>
<body style="font:15px system-ui;margin:4rem auto;max-width:28rem;text-align:center">
<h1 style="font-size:1.2rem">The Nexplore sign-in did not finish</h1>
<p>Return to Nexi Work to see why and try again. You can close this window.</p>`;

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
const loopback = (state: string) =>
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
            .end(code ? DONE_PAGE : FAILED_PAGE);
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
export const runEntraBrowserSignIn = (input: {
  readonly entra: EntraClient;
  readonly launchBrowser: (url: string) => Effect.Effect<void, ExternalLauncherError>;
  readonly timeout: Duration.Duration;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { verifier, challenge, state } = yield* makePkceRequest.pipe(
        Effect.mapError(() => "Could not prepare the browser sign-in."),
      );
      const { port, callback } = yield* loopback(state);
      const redirectUri = `http://localhost:${port}`;
      yield* input
        .launchBrowser(input.entra.authorizeUrl({ redirectUri, challenge, state }))
        .pipe(Effect.mapError(() => NO_BROWSER));
      const result = yield* Effect.promise(() => callback).pipe(
        Effect.timeoutOrElse({
          duration: input.timeout,
          orElse: () => Effect.fail("The browser sign-in did not finish in time."),
        }),
      );
      if ("error" in result) return yield* Effect.fail(result.error);
      return yield* input.entra.exchangeCode({ code: result.code, verifier, redirectUri });
    }),
  );
