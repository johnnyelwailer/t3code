import {
  type CloudBrokerStatus,
  CloudSessionFailedError,
  type CloudSessionAttachResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { NexiBrokerAuth } from "./t3team-NexiBrokerAuth.ts";
import { makeNexiBrokerClient } from "./t3team-NexiBrokerClient.ts";
import { type BrokerForwarder, startBrokerForwarder } from "./t3team-NexiBrokerForwarder.ts";

/**
 * Cloud sessions over the Nexi broker, from this machine's side: sign-in state, grants for new
 * dispatches, and `attach` — which makes a ready session reachable here (a loopback forwarder) and
 * hands the client a fresh one-time pairing credential minted by the session's own server. The
 * client then connects exactly as it does to an SSH environment: pairing → bearer → WebSocket.
 */

export class NexiBrokerService extends Context.Service<
  NexiBrokerService,
  {
    readonly enabled: boolean;
    readonly status: Effect.Effect<CloudBrokerStatus>;
    readonly signIn: Effect.Effect<CloudBrokerStatus, CloudSessionFailedError>;
    readonly signOut: Effect.Effect<void>;
    readonly requestGrant: (gheLogin: string) => Effect.Effect<string, CloudSessionFailedError>;
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

const make = Effect.fn("cloud.broker.service.make")(function* () {
  const auth = yield* NexiBrokerAuth;
  if (Option.isNone(auth.config)) {
    return {
      enabled: false,
      status: auth.status,
      signIn: auth.signIn,
      signOut: auth.signOut,
      requestGrant: () => Effect.fail(notEnabled),
      attach: () => Effect.fail(notEnabled),
      pair: () => Effect.fail(notEnabled),
    } satisfies NexiBrokerService["Service"];
  }
  const config = auth.config.value;
  const client = yield* makeNexiBrokerClient(config, auth.accessToken);
  const forwarders = new Map<string, BrokerForwarder>();
  yield* Effect.addFinalizer(() => Effect.sync(() => forwarders.forEach((f) => f.close())));
  const tokenPromise = () => Effect.runPromise(auth.accessToken);
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
    status: auth.status,
    signIn: auth.signIn,
    signOut: Effect.gen(function* () {
      yield* auth.signOut;
      forwarders.forEach((f) => f.close());
      forwarders.clear();
    }),
    requestGrant: client.requestGrant,
    attach,
    pair: client.mintPairing,
  } satisfies NexiBrokerService["Service"];
});

export const layer = Layer.effect(NexiBrokerService, make());

/** No broker: sessions use T3 Connect. For builds without a broker URL and for tests. */
export const layerDisabled = Layer.succeed(NexiBrokerService, {
  enabled: false,
  status: Effect.succeed({ enabled: false, auth: { _tag: "SignedOut" as const }, lastError: null }),
  signIn: Effect.fail(notEnabled),
  signOut: Effect.void,
  requestGrant: () => Effect.fail(notEnabled),
  attach: () => Effect.fail(notEnabled),
  pair: () => Effect.fail(notEnabled),
});
