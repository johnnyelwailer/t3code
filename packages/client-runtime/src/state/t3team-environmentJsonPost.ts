import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

const definedHeaders = (headers: object): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

/** A route's status and decoded JSON body, whatever the status: the caller owns the error shape. */
export interface EnvironmentJsonPostResponse {
  readonly status: number;
  readonly payload: unknown;
}

/**
 * POST a JSON body to a route that is not part of the typed environment API (the `/api/t3team/*`
 * routes) on any environment, authenticated like every other environment request: the bearer
 * token, or a DPoP proof signed for this request with a one-time refresh-and-retry when the
 * environment rejects the credential. Cookie connections send credentialed requests.
 *
 * The typed-group client `executeAuthenticatedEnvironmentHttpRequest` builds is unused here; the
 * request is made through the same `HttpClient` with the headers it computed. The URL is captured
 * from `url` because a DPoP proof is bound to the exact URL, which can change on refresh.
 */
export const postEnvironmentJson = Effect.fn("clientRuntime.state.postEnvironmentJson")(
  function* (input: {
    readonly prepared: PreparedConnection;
    readonly path: string;
    readonly body: unknown;
    readonly timeoutMs?: number;
  }) {
    // Both are optional services: only a DPoP (T3 Connect) connection needs them.
    const signer = yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(
      RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
    );
    let requestUrl = "";
    return yield* executeAuthenticatedEnvironmentHttpRequest({
      prepared: input.prepared,
      signer,
      remoteAuthorization,
      group: "auth",
      method: "POST",
      url: (httpBaseUrl) => {
        requestUrl = environmentEndpointUrl(httpBaseUrl, input.path);
        return requestUrl;
      },
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      request: ({ headers }) =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const response = yield* client.execute(
            HttpClientRequest.post(requestUrl).pipe(
              HttpClientRequest.setHeaders(definedHeaders(headers)),
              HttpClientRequest.bodyJsonUnsafe(input.body),
            ),
          );
          const payload = yield* response.json.pipe(Effect.orElseSucceed(() => null));
          return { status: response.status, payload } satisfies EnvironmentJsonPostResponse;
        }),
      // A rejected credential is a 401 with the route's own body; DPoP gets one renewal.
      isUnauthorizedResponse: (response) => response.status === 401,
    });
  },
);
