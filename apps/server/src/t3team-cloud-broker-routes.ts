import {
  AuthRelayReadScope,
  AuthRelayWriteScope,
  CloudSessionFailedError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http";

import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import { credentialRoute } from "./t3team-credentialRoute.ts";

/**
 * Nexi broker status and session attach for this machine's client. `pairing` returns a one-time
 * credential for the user's cloud VM, so these require the same scopes as the cloud-session RPCs
 * (relay:read / relay:write). Signing in is the account's job (`t3team-account-routes`).
 */

/** The JSON body, read once: a request body is a stream. */
const readBody = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return (yield* request.json.pipe(Effect.orElseSucceed(() => ({})))) as {
    readonly sessionId?: unknown;
    readonly environmentId?: unknown;
  };
});

const sessionIdOf = (body: { readonly sessionId?: unknown }) => {
  const sessionId = body.sessionId;
  if (typeof sessionId === "string" && /^\d{1,20}$/.test(sessionId))
    return Effect.succeed(sessionId);
  return Effect.fail(
    new CloudSessionFailedError({
      reason: "unknown_session",
      message: "That session does not exist.",
    }),
  );
};

/** The environment the client knows the session by, when it sent one (an opaque id). */
const environmentIdOf = (body: { readonly environmentId?: unknown }) =>
  typeof body.environmentId === "string" && /^[\w.:-]{1,128}$/.test(body.environmentId)
    ? body.environmentId
    : undefined;

const route = <A, R>(
  method: "GET" | "POST",
  path: `/api/t3team/cloud-broker/${string}`,
  scope: typeof AuthRelayReadScope | typeof AuthRelayWriteScope,
  handler: (broker: NexiBrokerService["Service"]) => Effect.Effect<A, CloudSessionFailedError, R>,
) =>
  credentialRoute({
    method,
    path,
    scope,
    handler: Effect.gen(function* () {
      return yield* handler(yield* NexiBrokerService);
    }),
    onError: (error: CloudSessionFailedError) => ({ error: error.reason, message: error.message }),
  });

export const t3teamCloudBrokerRouteLayer = Layer.mergeAll(
  route("GET", "/api/t3team/cloud-broker/status", AuthRelayReadScope, (broker) =>
    Effect.succeed(broker.status),
  ),
  route("POST", "/api/t3team/cloud-broker/attach", AuthRelayWriteScope, (broker) =>
    Effect.gen(function* () {
      const body = yield* readBody;
      const sessionId = yield* sessionIdOf(body);
      const environmentId = environmentIdOf(body);
      return yield* broker.attach({
        sessionId,
        ...(environmentId !== undefined ? { environmentId } : {}),
      });
    }),
  ),
  route("POST", "/api/t3team/cloud-broker/pairing", AuthRelayWriteScope, (broker) =>
    readBody.pipe(
      Effect.flatMap(sessionIdOf),
      Effect.flatMap(broker.pair),
      Effect.map((pairingCredential) => ({ pairingCredential })),
    ),
  ),
);
