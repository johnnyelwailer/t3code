/**
 * The delegate_task `cloudSession` extension (flag `DELEGATE_CLOUD`): the cloud session a child
 * runs on, for the project's own repository.
 *
 * - `"auto"`: a fitting session (`selectFittingCloudSession`) with room for another child; a
 *   ready one is probed first (its own project, the requested model), one still starting is
 *   checked by the child's first turn. None fits: one is started for the project.
 * - `"new"`: one is started for the project.
 * - any other string: that listed session.
 *
 * At most one session is started per request, and one per project at a time (the start guard).
 * A model the session does not offer, a signed-out broker, or no usable session at all make the
 * placement `unplaced`, and delegate_task then fails with that reason: a cloud child never quietly
 * runs here instead. Placement never fails or dies itself.
 */
import type { CloudSession } from "@t3tools/contracts";
import { selectFittingCloudSession } from "@t3tools/shared/t3team-cloudSessionFit";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type {
  CloudSessionPlacement,
  CloudSessionPlacementInput,
  DelegateCloudSessions,
} from "./t3team-delegateTaskCloudTypes.ts";

export type {
  CloudSessionPlacement,
  CloudSessionPlacementInput,
  DelegateCloudSessions,
} from "./t3team-delegateTaskCloudTypes.ts";

const unplaced = (reason: string): CloudSessionPlacement => ({ kind: "unplaced", reason });

const startNew = Effect.fn("delegateTask.cloudSession.startNew")(function* (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
) {
  const claim = yield* sessions.startGuard.claim(input.projectId);
  if (!claim.claimed) {
    return unplaced(
      `A cloud session for this project is already starting (requested ${claim.startedSecondsAgo}s ago). Delegate again with cloudSession 'auto' once it is listed.`,
    );
  }
  const session = yield* sessions
    .start(input.projectId)
    .pipe(Effect.tapError(() => sessions.startGuard.release(input.projectId)));
  if (session.sessionId.startsWith("pending:")) {
    return unplaced(
      "A cloud session was started for this project but is not listed yet. Delegate again with cloudSession 'auto' in a minute.",
    );
  }
  yield* sessions.capacity.tryReserve(input.requestKey, session.sessionId);
  return { kind: "placed", session, ready: false, started: true } satisfies CloudSessionPlacement;
});

const ENDED = new Set<CloudSession["phase"]>(["failed", "stopped", "cancelled"]);

/**
 * A listed session the child may use. A slot is reserved first (atomically, so concurrent
 * delegations cannot all see room) and kept only when the session is starting or passes the probe
 * of its own project and the requested model; any other verdict releases it.
 */
const usable = Effect.fn("delegateTask.cloudSession.usable")(function* (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
  session: CloudSession,
) {
  if (ENDED.has(session.phase)) return "ended" as const;
  if (!(yield* sessions.capacity.tryReserve(input.requestKey, session.sessionId))) {
    return "full" as const;
  }
  if (session.phase !== "ready" || !session.environmentId) return "starting" as const;
  const probed = yield* Effect.result(sessions.probe(session.sessionId, input));
  if (probed._tag === "Success") return "ready" as const;
  yield* sessions.capacity.release(input.requestKey);
  const error = probed.failure;
  if (error._tag === "RemoteEnvironmentRejected" && error.reason === "model") return error;
  return "unusable" as const;
});

const place = Effect.fn("delegateTask.cloudSession.place")(function* (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
) {
  const { request } = input;
  yield* sessions.brokerReady;
  if (request.kind === "new") return yield* startNew(sessions, input);
  const listed = yield* sessions.list;
  if (!listed.configured) {
    return unplaced("Cloud sessions are not set up on this server (no `gh` login).");
  }
  const nowMs = yield* Clock.currentTimeMillis;
  const excluded: Array<string> = [];
  for (let round = 0; round <= listed.sessions.length; round += 1) {
    const candidate =
      request.kind === "session"
        ? listed.sessions.find((session) => session.sessionId === request.sessionId)
        : selectFittingCloudSession({
            sessions: listed.sessions,
            repositoryName: input.repositoryName,
            nowMs,
            excludeSessionIds: excluded,
          })?.session;
    if (candidate === undefined) break;
    const verdict = yield* usable(sessions, input, candidate);
    if (typeof verdict !== "string") return unplaced(verdict.message);
    if (verdict === "ready" || verdict === "starting") {
      return {
        kind: "placed",
        session: candidate,
        ready: verdict === "ready",
        started: false,
      } satisfies CloudSessionPlacement;
    }
    if (request.kind === "session") {
      return unplaced(
        verdict === "ended"
          ? `Cloud session ${candidate.sessionId} has ended (${candidate.phase}); name a running session or use 'auto'.`
          : verdict === "full"
            ? `Cloud session ${candidate.sessionId} already runs ${sessions.capacity.limit} delegated children.`
            : `Cloud session ${candidate.sessionId} cannot take this child: its own project is not this repository, or it cannot be reached.`,
      );
    }
    excluded.push(candidate.sessionId);
  }
  if (request.kind === "session") {
    return unplaced(`Cloud session ${request.sessionId} is not in your session list.`);
  }
  return yield* startNew(sessions, input);
});

export const placeOnCloudSession = (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
): Effect.Effect<CloudSessionPlacement> =>
  place(sessions, input).pipe(
    Effect.catch((error) => Effect.succeed(unplaced(`${error.message} (${error.reason})`))),
    Effect.catchCause((cause) =>
      Effect.logWarning("delegate_task cloudSession placement failed unexpectedly", {
        cause: Cause.pretty(cause),
      }).pipe(Effect.as(unplaced("An unexpected error occurred while choosing a cloud session."))),
    ),
  );
