import {
  type CloudBrokerStatus,
  CloudSessionFailedError,
  type CloudSessionAttachResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Accounts } from "../account/t3team-Accounts.ts";
import { BROKER_RESOURCE, resolveNexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";
import { makeNexiBrokerClient } from "./t3team-NexiBrokerClient.ts";
import { type BrokerForwarder, startBrokerForwarder } from "./t3team-NexiBrokerForwarder.ts";

/**
 * Cloud sessions over the Nexi broker, from this machine's side: which account it authenticates
 * with (the sign-in itself belongs to `t3team-Accounts`), grants for new dispatches, and `attach` — which makes a ready session reachable here (a loopback forwarder) and
 * hands the client a fresh one-time pairing credential minted by the session's own server. The
 * client then connects exactly as it does to an SSH environment: pairing → bearer → WebSocket.
 */

export class NexiBrokerService extends Context.Service<
  NexiBrokerService,
  {
    readonly enabled: boolean;
    readonly status: CloudBrokerStatus;
    /**
     * A grant for the next dispatch. `secrets` (name → value) are parked with it in the broker's
     * memory and redeemed once by the session the grant belongs to; they never become an input.
     */
    readonly requestGrant: (
      gheLogin: string,
      secrets?: Readonly<Record<string, string>>,
    ) => Effect.Effect<string, CloudSessionFailedError>;
    readonly attach: (
      sessionId: string,
    ) => Effect.Effect<CloudSessionAttachResult, CloudSessionFailedError>;
    /** A fresh one-time pairing credential from the session's own server (first connect only). */
    readonly pair: (sessionId: string) => Effect.Effect<string, CloudSessionFailedError>;
  }
>()("t3/cloud/t3team-NexiBrokerService/NexiBrokerService") {}

const notEnabled = new CloudSessionFailedError({
  reason: "broker_unavailable",
  message: "This build has no Nexi broker configured.",
});

const disabled: NexiBrokerService["Service"] = {
  enabled: false,
  status: { enabled: false, accountId: null },
  requestGrant: () => Effect.fail(notEnabled),
  attach: () => Effect.fail(notEnabled),
  pair: () => Effect.fail(notEnabled),
};

const make = Effect.fn("cloud.broker.service.make")(function* () {
  const resolved = yield* resolveNexiBrokerConfig();
  if (Option.isNone(resolved)) return disabled;
  const config = resolved.value;
  const accounts = yield* Accounts;
  const accessToken = accounts.accessToken(config.account, BROKER_RESOURCE).pipe(
    Effect.mapError(
      (error) =>
        new CloudSessionFailedError({
          reason:
            error.reason === "sign_in_required" ? "broker_sign_in_required" : "broker_unavailable",
          message: error.message,
        }),
    ),
  );
  const client = yield* makeNexiBrokerClient(config, accessToken);
  const forwarders = new Map<string, BrokerForwarder>();
  yield* Effect.addFinalizer(() => Effect.sync(() => forwarders.forEach((f) => f.close())));
  const tokenPromise = () => Effect.runPromise(accessToken);
  const streamUrl = (runId: string) =>
    `${config.url.replace(/^http/, "ws")}/v1/client/stream?session=${encodeURIComponent(runId)}`;

  const attach: NexiBrokerService["Service"]["attach"] = (sessionId) =>
    Effect.gen(function* () {
      // The broker answers only with this user's sessions, so a session id that is not listed is
      // somebody else's, not registered yet, or over — the message must hold for all three.
      const sessions = yield* client.listSessions;
      // Forwarders for sessions that ended are closed here rather than on a timer: an idle app
      // spends no broker calls.
      for (const [runId, forwarder] of forwarders) {
        if (!sessions.some((s) => s.runId === runId)) {
          forwarder.close();
          forwarders.delete(runId);
        }
      }
      const session = sessions.find((s) => s.runId === sessionId);
      if (session === undefined || !session.environmentId) {
        return yield* new CloudSessionFailedError({
          reason: "unknown_session",
          message: "That cloud session is not running: it is still starting, or it has ended.",
        });
      }
      let forwarder = forwarders.get(sessionId);
      if (forwarder === undefined) {
        forwarder = yield* Effect.tryPromise({
          try: () =>
            startBrokerForwarder({ streamUrl: streamUrl(sessionId), accessToken: tokenPromise }),
          catch: () =>
            new CloudSessionFailedError({
              reason: "broker_unavailable",
              message: "Could not open a local port for the session.",
            }),
        });
        forwarders.set(sessionId, forwarder);
      }
      const base = `127.0.0.1:${forwarder.port}`;
      return {
        environmentId: session.environmentId,
        label: session.label ?? "Cloud session",
        httpBaseUrl: `http://${base}`,
        wsBaseUrl: `ws://${base}`,
      } satisfies CloudSessionAttachResult;
    });

  return {
    enabled: true,
    status: { enabled: true, accountId: config.account },
    requestGrant: client.requestGrant,
    attach,
    pair: client.mintPairing,
  } satisfies NexiBrokerService["Service"];
});

export const layer = Layer.effect(NexiBrokerService, make());

/** No broker: sessions use T3 Connect. For builds without a broker URL and for tests. */
export const layerDisabled = Layer.succeed(NexiBrokerService, disabled);
