/**
 * Connects THIS server, as a client, to a cloud session's server through the Nexi broker: the
 * server-side counterpart of the client's `makeBrokerResolver`
 * (`packages/client-runtime/src/connection/t3team-brokerConnection.ts`), built on the same
 * protocol functions (`bootstrapRemoteBearerSession`, `resolveRemoteWebSocketConnectionUrl`).
 *
 * 1. `attach` makes the session reachable on a loopback forwarder (`NexiBrokerService.attach`).
 * 2. A bearer for the session is reused when held; otherwise `pair` mints a one-time pairing
 *    credential on the session's own server, exchanged at its `/oauth/token`. The broker allows
 *    one pairing request per session at a time, so a refused pairing is retried briefly.
 * 3. The bearer buys a one-time WebSocket ticket; the result is the `/ws` URL to open.
 *
 * Bearers live in memory for this server's lifetime: a session lasts hours at most, and a restart
 * costs one more pairing. A held bearer the session rejects is dropped and paired again once.
 */
import {
  type CloudSessionAttachInput,
  type CloudSessionAttachResult,
  CloudSessionFailedError,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "@t3tools/contracts";
import {
  bootstrapRemoteBearerSession,
  resolveRemoteWebSocketConnectionUrl,
} from "@t3tools/client-runtime/authorization";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";

export interface CloudSessionBrokerAccess {
  readonly attach: (
    input: CloudSessionAttachInput,
  ) => Effect.Effect<CloudSessionAttachResult, CloudSessionFailedError>;
  readonly pair: (sessionId: string) => Effect.Effect<string, CloudSessionFailedError>;
}

export interface CloudSessionConnection {
  readonly sessionId: string;
  readonly environmentId: string;
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  /** The `/ws` URL with a one-time ticket: open it once, promptly. */
  readonly socketUrl: string;
}

export interface CloudSessionConnector {
  readonly connect: (
    sessionId: string,
  ) => Effect.Effect<CloudSessionConnection, CloudSessionFailedError>;
  /** Forgets the session's bearer (the session ended, or rejected it). */
  readonly forget: (sessionId: string) => Effect.Effect<void>;
}

const PAIRING_RETRIES = 3;

const unreachable = (message: string) =>
  new CloudSessionFailedError({ reason: "unknown_session", message });

export const makeCloudSessionConnector = Effect.fn("cloud.sessionConnector.make")(function* (
  broker: CloudSessionBrokerAccess,
) {
  const http = yield* HttpClient.HttpClient;
  const bearers = yield* Ref.make(new Map<string, string>());

  const forget = (sessionId: string) =>
    Ref.update(bearers, (current) => {
      const next = new Map(current);
      next.delete(sessionId);
      return next;
    });

  const pairBearer = Effect.fn("cloud.sessionConnector.pair")(function* (
    sessionId: string,
    httpBaseUrl: string,
  ) {
    const credential = yield* broker.pair(sessionId).pipe(
      Effect.retry({
        times: PAIRING_RETRIES,
        schedule: Schedule.exponential("500 millis"),
        while: (error) => error.reason === "broker_unavailable",
      }),
    );
    const access = yield* bootstrapRemoteBearerSession({ httpBaseUrl, credential }).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
      Effect.mapError(() =>
        unreachable("The cloud session's server did not accept its pairing credential."),
      ),
    );
    yield* Ref.update(bearers, (current) => new Map(current).set(sessionId, access.access_token));
    return access.access_token;
  });

  const socketUrlFor = (attached: CloudSessionAttachResult, bearerToken: string) =>
    resolveRemoteWebSocketConnectionUrl({
      wsBaseUrl: attached.wsBaseUrl,
      httpBaseUrl: attached.httpBaseUrl,
      bearerToken,
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
      Effect.map((raw) => {
        const url = new URL(raw);
        url.searchParams.set("orchestrationProtocol", ORCHESTRATION_PROTOCOL_VERSION_TEXT);
        return url.toString();
      }),
    );

  const connect = Effect.fn("cloud.sessionConnector.connect")(function* (sessionId: string) {
    const attached = yield* broker.attach({ sessionId });
    const attachedId = attached.sessionId ?? sessionId;
    const held = (yield* Ref.get(bearers)).get(attachedId);
    const viaHeld =
      held === undefined
        ? undefined
        : yield* socketUrlFor(attached, held).pipe(
            Effect.map((socketUrl) => ({ bearerToken: held, socketUrl })),
            Effect.catch(() => Effect.as(forget(attachedId), undefined)),
          );
    const authorized =
      viaHeld ??
      (yield* Effect.gen(function* () {
        const bearerToken = yield* pairBearer(attachedId, attached.httpBaseUrl);
        const socketUrl = yield* socketUrlFor(attached, bearerToken).pipe(
          Effect.mapError(() =>
            unreachable("The cloud session's server refused a connection ticket."),
          ),
        );
        return { bearerToken, socketUrl };
      }));
    return {
      sessionId: attachedId,
      environmentId: attached.environmentId,
      httpBaseUrl: attached.httpBaseUrl,
      ...authorized,
    } satisfies CloudSessionConnection;
  });

  return { connect, forget } satisfies CloudSessionConnector;
});
