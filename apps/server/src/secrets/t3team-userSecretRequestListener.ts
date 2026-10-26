// @effect-diagnostics nodeBuiltinImport:off - the listener is a Node HTTP server on loopback; its token comes from node:crypto.
/**
 * One request-injection listener: `http://127.0.0.1:<random port>/<random token>` for one route,
 * open for as long as the `Scope` it was started in (the injected command) and closed with every
 * connection when that ends. It binds the IPv4 loopback address only, and a request without the
 * token is answered 403 and never forwarded, so another local process cannot use it.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  forwardRequest,
  type ForwardContext,
  type ForwardedRequest,
  type ProxyRoute,
  type UpstreamFetch,
} from "./t3team-userSecretRequestForward.ts";

export const REQUEST_LISTENER_HOST = "127.0.0.1";

export class UserSecretListenerError extends Schema.TaggedError<UserSecretListenerError>()(
  "UserSecretListenerError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not open the local address for request injection.";
  }
}

const listen = (server: NodeHttp.Server) =>
  Effect.callback<number, UserSecretListenerError>((resume) => {
    server.once("error", (cause) => resume(Effect.fail(new UserSecretListenerError({ cause }))));
    server.listen({ host: REQUEST_LISTENER_HOST, port: 0 }, () => {
      const address = server.address();
      resume(
        typeof address === "object" && address !== null
          ? Effect.succeed(address.port)
          : Effect.fail(new UserSecretListenerError({ cause: address })),
      );
    });
  });

const close = (server: NodeHttp.Server) =>
  Effect.callback<void>((resume) => {
    server.closeAllConnections();
    server.close(() => resume(Effect.void));
  });

export const openRequestListener = Effect.fn("UserSecretRequestInjection.openListener")(
  function* (input: {
    readonly route: ProxyRoute;
    readonly patterns: ReadonlyArray<string>;
    readonly fetch: UpstreamFetch;
    readonly forwarded: Array<ForwardedRequest>;
  }) {
    const token = NodeCrypto.randomBytes(24).toString("hex");
    const context: { current?: ForwardContext } = {};
    const server = NodeHttp.createServer((request, response) => {
      if (context.current === undefined) return response.destroy();
      forwardRequest(request, response, context.current).catch(() => {
        if (response.headersSent) return response.destroy();
        response.writeHead(502).end();
      });
    });
    const port = yield* Effect.acquireRelease(listen(server), () => close(server));
    const baseUrl = `http://${REQUEST_LISTENER_HOST}:${port}/${token}`;
    context.current = { ...input, token, baseUrl };
    return baseUrl;
  },
);
