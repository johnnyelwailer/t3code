import {
  type CloudBrokerStatus,
  CloudSessionFailedError,
  type CloudSessionAttachInput,
  type CloudSessionAttachResult,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Accounts } from "../account/t3team-Accounts.ts";
import { BROKER_RESOURCE, resolveNexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";
import {
  type BrokerSession,
  makeNexiBrokerClient,
  type StandbyClaim,
} from "./t3team-NexiBrokerClient.ts";
import { SESSION_ABSENT_GRACE_MS, makeAbsenceTracker } from "./t3team-brokerAbsence.ts";
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
      /** The project a machine session is for: it counts toward that project's warm pool. */
      poolKey?: string,
      /** Names the project workflow may deliver. Values are not included. */
      teamSecrets?: { readonly repository: string; readonly names: ReadonlyArray<string> },
    ) => Effect.Effect<string, CloudSessionFailedError>;
    /** Reports the projects this user has here, so the broker keeps them warm (#562 option B). */
    readonly reportInterest: (
      pools: ReadonlyArray<string>,
    ) => Effect.Effect<void, CloudSessionFailedError>;
    readonly attach: (
      input: CloudSessionAttachInput,
    ) => Effect.Effect<CloudSessionAttachResult, CloudSessionFailedError>;
    /** A fresh one-time pairing credential from the session's own server (first connect only). */
    readonly pair: (sessionId: string) => Effect.Effect<string, CloudSessionFailedError>;
    /** A warm standby of the project for this user (its run id), or null when none is idle. */
    readonly claimStandby: (
      claim: StandbyClaim,
    ) => Effect.Effect<string | null, CloudSessionFailedError>;
    /** This user's sessions as the broker knows them (claimed standbys included). */
    readonly sessions: Effect.Effect<ReadonlyArray<BrokerSession>, CloudSessionFailedError>;
  }
>()("t3/cloud/t3team-NexiBrokerService/NexiBrokerService") {}

/**
 * The listed session an attach reaches: the one asked for, else — a workspace's sessions share
 * their environment, since the snapshot keeps its id — the live one serving the same environment.
 */
export function sessionToAttach<
  S extends { readonly runId: string; readonly environmentId?: string | null | undefined },
>(sessions: readonly S[], input: CloudSessionAttachInput): S | undefined {
  const asked = sessions.find(
    (s) =>
      s.runId === input.sessionId &&
      s.environmentId &&
      (input.environmentId === undefined || s.environmentId === input.environmentId),
  );
  if (asked !== undefined || input.environmentId === undefined) return asked;
  // Two live sessions in one workspace (started side by side) serve the same environment: the
  // newest run wins, so reconnects stay on one machine instead of following list order.
  return sessions
    .filter((s) => s.environmentId === input.environmentId)
    .reduce<S | undefined>(
      (newest, s) => (newest === undefined || Number(s.runId) > Number(newest.runId) ? s : newest),
      undefined,
    );
}

/**
 * Why no session can be attached. A session the broker lists without an environment id is still
 * starting (its machine has not registered yet), and one it does not list may be reconnecting to
 * the broker: both are retryable (`unknown_session`). A session missing for longer than
 * `SESSION_ABSENT_GRACE_MS` — past every reconnect and broker restart — has ended, which a client
 * must stop retrying (`session_ended`).
 */
export function attachFailure(
  sessions: ReadonlyArray<{ readonly runId: string }>,
  input: CloudSessionAttachInput,
  absentForMs: number,
): CloudSessionFailedError {
  if (sessions.some((s) => s.runId === input.sessionId)) {
    return new CloudSessionFailedError({
      reason: "unknown_session",
      message: "That cloud session is not running yet: it is still starting.",
    });
  }
  return absentForMs >= SESSION_ABSENT_GRACE_MS
    ? new CloudSessionFailedError({
        reason: "session_ended",
        message: "That cloud session has ended.",
      })
    : new CloudSessionFailedError({
        reason: "unknown_session",
        message:
          "That cloud session is not listed by the broker right now. It may be reconnecting.",
      });
}

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
  claimStandby: () => Effect.succeed(null),
  reportInterest: () => Effect.void,
  sessions: Effect.succeed([]),
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
  const absence = makeAbsenceTracker();
  yield* Effect.addFinalizer(() => Effect.sync(() => forwarders.forEach((f) => f.close())));
  const tokenPromise = () => Effect.runPromise(accessToken);
  const streamUrl = (runId: string) =>
    `${config.url.replace(/^http/, "ws")}/v1/client/stream?session=${encodeURIComponent(runId)}`;

  const attach: NexiBrokerService["Service"]["attach"] = (input) =>
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
      const session = sessionToAttach(sessions, input);
      if (session === undefined || !session.environmentId) {
        return yield* attachFailure(
          sessions,
          input,
          absence.absent(input.sessionId, yield* Clock.currentTimeMillis),
        );
      }
      absence.present(input.sessionId);
      const sessionId = session.runId;
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
        sessionId,
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
    claimStandby: client.claimStandby,
    reportInterest: client.reportInterest,
    sessions: client.listSessions,
  } satisfies NexiBrokerService["Service"];
});

export const layer = Layer.effect(NexiBrokerService, make());

/** No broker: sessions use T3 Connect. For builds without a broker URL and for tests. */
export const layerDisabled = Layer.succeed(NexiBrokerService, disabled);
