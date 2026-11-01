/**
 * The Nexi cloud sessions `t3_environment_links` lists beside the linked environments, so one
 * call shows every environment an agent can reach. Only with the cloud-session placement built
 * (flag `DELEGATE_CLOUD`); otherwise the listing adds nothing and the result is unchanged.
 * A session is reached by `delegate_task` `extensions.cloudSession`, never by environment id.
 */
import type {
  CloudSession,
  OrchestratorMcpCloudSessionRow,
  OrchestratorMcpCloudSessions,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { PeerForwarding } from "./peer/PeerForwarding.ts";
import { DelegateCloudSessionPlacement } from "./t3team-delegateTaskCloudSessionLayer.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudTypes.ts";

/** Sessions delegate_task can still place a child on, as `placeOnCloudSession` sees them. */
const LIVE_PHASES = new Set<CloudSession["phase"]>([
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
]);

const heldAt = (session: CloudSession, nowMs: number) => {
  const endsAtMs = session.endsAt === undefined ? Number.NaN : Date.parse(session.endsAt);
  return !Number.isFinite(endsAtMs) || endsAtMs > nowMs;
};

export const cloudSessionRowsOf = (
  sessions: ReadonlyArray<CloudSession>,
  nowMs: number,
): ReadonlyArray<OrchestratorMcpCloudSessionRow> =>
  sessions
    // The placement reaches sessions through the broker only.
    .filter(
      (session) =>
        session.transport === "nexi_broker" &&
        LIVE_PHASES.has(session.phase) &&
        heldAt(session, nowMs),
    )
    .map((session) => ({
      kind: "cloud" as const,
      sessionId: session.sessionId,
      phase: session.phase,
      machineLabel: session.machineLabel,
      ...(session.name === undefined ? {} : { repository: session.name }),
      ...(session.endsAt === undefined ? {} : { endsAt: session.endsAt }),
    }));

const unavailable = (why: string): OrchestratorMcpCloudSessions => ({
  sessions: [],
  unavailable: `Cloud sessions not listed: ${why}.`,
});

/** Never fails: a broker that cannot be asked costs the cloud rows, not the links. */
export const makeListing = (
  placement: Pick<DelegateCloudSessions, "list">,
): Effect.Effect<OrchestratorMcpCloudSessions> =>
  placement.list.pipe(
    Effect.flatMap((listed) =>
      listed.configured
        ? Effect.map(Clock.currentTimeMillis, (nowMs) => ({
            sessions: cloudSessionRowsOf(listed.sessions, nowMs),
          }))
        : Effect.succeed(unavailable("not set up here")),
    ),
    Effect.catch((error) => Effect.succeed(unavailable(error.reason))),
    Effect.catchDefect(() => Effect.succeed(unavailable("unexpected error"))),
  );

/**
 * `PeerForwarding` with `links` extended by the cloud sessions. Without the placement (flag off)
 * it is the same service, so the result is untouched. `links` failing (beta off) stays a failure.
 */
export const layer = Layer.effect(
  PeerForwarding,
  Effect.gen(function* () {
    const base = yield* PeerForwarding;
    const placement = yield* Effect.serviceOption(DelegateCloudSessionPlacement);
    if (Option.isNone(placement)) return base;
    const listing = makeListing(placement.value);
    return PeerForwarding.of({
      ...base,
      links: (scope) =>
        base
          .links(scope)
          .pipe(
            Effect.flatMap((result) =>
              Effect.map(listing, (cloudSessions) => ({ ...result, cloudSessions })),
            ),
          ),
    });
  }),
);
