/**
 * The delegate_task `cloudSession` extension (flag `DELEGATE_CLOUD`): which cloud session the
 * child's work belongs on, for the repository the child works on.
 *
 * - `"auto"`: names a fitting session (`selectFittingCloudSession`): a ready one, else one still
 *   starting. When none fits it reports that a new one is needed.
 * - `"new"`: reports that a new one is needed.
 * - any other string: that session id, as listed.
 *
 * Nothing is dispatched while `start` is absent: a session no child runs on would hold a fleet
 * machine for nothing. The child itself is still created and run on THIS server, no
 * `ThreadEnvironmentBinding` is recorded, and every note says both. Running the child on the
 * session is designed in docs/nexi-work/design/delegate-to-cloud-session.md (nx-nexi).
 */
import type {
  CloudSession,
  CloudSessionFailedError,
  CloudSessionListResult,
  ProjectId,
} from "@t3tools/contracts";
import { selectFittingCloudSession } from "@t3tools/shared/t3team-cloudSessionFit";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type { CloudSessionStartGuard } from "./t3team-delegateTaskCloudSessionStartGuard.ts";
import type { CloudSessionRequest } from "./t3team-delegateTaskCloudSessionExtension.ts";

export interface DelegateCloudSessions {
  readonly list: Effect.Effect<CloudSessionListResult, CloudSessionFailedError>;
  /** Fails with the broker's reason when this server cannot reach it (signed out, no broker). */
  readonly brokerReady: Effect.Effect<void, CloudSessionFailedError>;
  /** Starts a session for a project. Absent until a delegated child can run on one. */
  readonly start?: (projectId: ProjectId) => Effect.Effect<CloudSession, CloudSessionFailedError>;
  readonly startGuard: CloudSessionStartGuard;
}

export interface CloudSessionPlacementInput {
  readonly request: CloudSessionRequest;
  readonly projectId: ProjectId;
  /** The repository the child works on (`owner/name` or a name); null when it has none. */
  readonly repository: string | null;
  /** False when that repository is not the project's own: a session starts only for the project. */
  readonly projectRepository: boolean;
}

export const CHILD_RUNS_HERE_NOTE =
  "The child runs on THIS server, not on a cloud session, and no environment binding is " +
  "recorded: running a delegated child on a cloud session is not built yet (design: " +
  "docs/nexi-work/design/delegate-to-cloud-session.md).";

const repositoryNameOf = (repository: string | null) =>
  repository === null ? null : (repository.split("/").pop() ?? null);

/** Ready means usable now: the `ready` phase with its environment linked (the selector's rule). */
const describeSession = (session: CloudSession) => {
  const name = session.name ?? "Cloud session";
  const ready = session.phase === "ready" && Boolean(session.environmentId);
  const state = ready
    ? `ready${session.endsAt === undefined ? "" : ` until ${session.endsAt}`}`
    : session.phase === "ready"
      ? "starting (its environment is not linked yet)"
      : `${session.phase}, not ready yet`;
  return `'${name}' (${session.sessionId}) is ${state}`;
};

const failedNote = (error: CloudSessionFailedError) =>
  `No cloud session was named (${error.reason}): ${error.message}`;

const startOrReport = Effect.fn("delegateTask.cloudSession.startOrReport")(function* (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
) {
  const { start } = sessions;
  if (!input.projectRepository) {
    return `No fitting cloud session for ${input.repository ?? "this repository"}, and none can be started for it: a session starts for the project's own repository.`;
  }
  if (start === undefined) {
    return "No fitting cloud session for this project; a new one would be needed. None was started: starting one stays off until a delegated child can run on it.";
  }
  const claim = yield* sessions.startGuard.claim(input.projectId);
  if (!claim.claimed) {
    return `No fitting cloud session is listed yet, but a session for this project is already starting (requested ${claim.startedSecondsAgo}s ago); none was started.`;
  }
  yield* start(input.projectId).pipe(
    Effect.tap((session) =>
      Effect.logInfo("delegate_task started a cloud session", {
        sessionId: session.sessionId,
        projectId: input.projectId,
      }),
    ),
    Effect.tapError((error) =>
      Effect.logWarning("delegate_task could not start a cloud session", {
        reason: error.reason,
        message: error.message,
        projectId: input.projectId,
      }).pipe(Effect.andThen(sessions.startGuard.release(input.projectId))),
    ),
    Effect.ignore,
    Effect.forkDetach,
  );
  return "Starting a new cloud session for this project; it appears in the cloud session list once its machine is dispatched.";
});

const place = Effect.fn("delegateTask.cloudSession.place")(function* (
  sessions: DelegateCloudSessions,
  resolveInput: Effect.Effect<CloudSessionPlacementInput>,
) {
  const input = yield* resolveInput;
  const { request } = input;
  yield* sessions.brokerReady;
  const listed = yield* sessions.list;
  if (!listed.configured) {
    return "No cloud session was named: cloud sessions are not set up on this server (no `gh` login).";
  }
  if (request.kind === "session") {
    const named = listed.sessions.find((session) => session.sessionId === request.sessionId);
    return named === undefined
      ? `Cloud session ${request.sessionId} is not in your session list.`
      : `Cloud session ${describeSession(named)}.`;
  }
  if (request.kind === "new") return yield* startOrReport(sessions, input);
  const fit = selectFittingCloudSession({
    sessions: listed.sessions,
    repositoryName: repositoryNameOf(input.repository),
    nowMs: yield* Clock.currentTimeMillis,
  });
  if (fit !== null) return `Fitting cloud session ${describeSession(fit.session)}.`;
  return yield* startOrReport(sessions, input);
});

/**
 * The notes for one delegation. Never fails and never dies: it runs after the child exists, so a
 * cloud-session problem, expected or not, becomes a note instead of failing delegate_task. The
 * input is resolved inside the guard too (its project lookup can fail like anything else).
 */
export const placeOnCloudSession = (
  sessions: DelegateCloudSessions,
  resolveInput: Effect.Effect<CloudSessionPlacementInput>,
): Effect.Effect<ReadonlyArray<string>> =>
  place(sessions, resolveInput).pipe(
    Effect.catch((error) => Effect.succeed(failedNote(error))),
    Effect.catchCause((cause) =>
      Effect.logWarning("delegate_task cloudSession placement failed unexpectedly", {
        cause: Cause.pretty(cause),
      }).pipe(Effect.as("No cloud session was named: an unexpected error occurred while looking.")),
    ),
    Effect.map((note) => [note, CHILD_RUNS_HERE_NOTE]),
  );
