import {
  AuthRelayReadScope,
  AuthRelayWriteScope,
  CloudSessionFailedError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/http";

import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import { credentialRoute } from "./t3team-credentialRoute.ts";

/**
 * Nexi broker status and session attach for this machine's client. `pairing` returns a one-time
 * credential for the user's cloud VM, so these require the same scopes as the cloud-session RPCs
 * (relay:read / relay:write). Signing in is the account's job (`t3team-account-routes`).
 */

const readSessionId = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const body = yield* request.json.pipe(Effect.orElseSucceed(() => ({})));
  const sessionId = (body as { readonly sessionId?: unknown }).sessionId;
  if (typeof sessionId === "string" && /^\d{1,20}$/.test(sessionId)) return sessionId;
  return yield* new CloudSessionFailedError({
    reason: "unknown_session",
    message: "That session does not exist.",
  });
});

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
    readSessionId.pipe(Effect.flatMap(broker.attach)),
  ),
  route("POST", "/api/t3team/cloud-broker/pairing", AuthRelayWriteScope, (broker) =>
    readSessionId.pipe(
      Effect.flatMap(broker.pair),
      Effect.map((pairingCredential) => ({ pairingCredential })),
    ),
  ),
);
