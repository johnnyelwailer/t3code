// @effect-diagnostics nodeBuiltinImport:off - The in-app connect callback is a Node HTTP boundary.
import * as NodeHttp from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { connectLoopbackRedirectUri } from "@t3tools/shared/connectAuth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { renderLoopbackAuthorizationCompleteHtml } from "./cliAuthHtml.ts";

/**
 * Serves the 127.0.0.1 callback the hosted /connect page redirects the
 * authorization code to when a request carries a loopback port.
 *
 * Same route, state check, and completion page as the CLI's loopback flow —
 * the in-app mint just waits for the code instead of the terminal. Scoped:
 * the listener stops when the surrounding scope closes, so a failed or timed
 * out mint leaves no listener behind.
 */
export const startConnectLoopbackCallback = Effect.fn(
  "cloud.connect.start_loopback_callback",
)(function* (input: {
  readonly port: number;
  readonly state: string;
  readonly onCode: (code: string) => Effect.Effect<void>;
}) {
  const redirectUri = connectLoopbackRedirectUri(input.port);
  const callbackRoute = HttpRouter.add(
    "GET",
    "/callback",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.originalUrl, redirectUri);
      const code = url.searchParams.get("code");
      if (url.searchParams.get("state") !== input.state || !code) {
        return HttpServerResponse.text("Invalid T3 Connect authorization callback.", {
          status: 400,
        });
      }
      yield* input.onCode(code);
      return HttpServerResponse.html(renderLoopbackAuthorizationCompleteHtml());
    }),
  );
  return yield* HttpRouter.serve(callbackRoute, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    Layer.provide(
      NodeHttpServer.layer(NodeHttp.createServer, {
        host: "127.0.0.1",
        port: input.port,
        disablePreemptiveShutdown: true,
      }),
    ),
    Layer.build,
  );
});
