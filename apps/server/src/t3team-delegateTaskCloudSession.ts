/**
 * The delegate_task `cloudSession` extension (flag `DELEGATE_CLOUD`): which cloud session the
 * child's work belongs on, for the child's project.
 *
 * - `"auto"`: a fitting session (`selectFittingCloudSession`): a ready one, else one still
 *   starting; none fits, so one is started for the project.
 * - `"new"`: always start one for the project.
 * - any other string: that session id, as listed.
 *
 * The child itself is still created and run on THIS server: nothing here moves its turns, and no
 * `ThreadEnvironmentBinding` is recorded, since that binding reads as "the child is there". Every
 * note says so. Running the child on the session is designed in
 * docs/nexi-work/design/delegate-to-cloud-session.md (nx-nexi), not built.
 */
import {
  CLOUD_SESSION_HOLD_CEILING_SECONDS,
  type CloudSession,
  type CloudSessionCreateInput,
  type CloudSessionFailedError,
  type CloudSessionListResult,
  type ProjectId,
} from "@t3tools/contracts";
import { selectFittingCloudSession } from "@t3tools/shared/t3team-cloudSessionFit";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type { DelegatedTaskExtensionOption } from "./mcp/t3team-delegatedTaskPreparation.ts";
import type { ParseResult } from "./t3team-delegateTaskExtensions.ts";

export const CLOUD_SESSION_EXTENSION: DelegatedTaskExtensionOption = {
  key: "cloudSession",
  description:
    "'auto' | 'new' | <cloud session id>: the cloud session for the child's project. 'auto' reuses a ready or starting session for the project's repository, else starts one; 'new' always starts one. The child still runs on THIS server; the result names the session and its state.",
};

export type CloudSessionRequest =
  | { readonly kind: "auto" }
  | { readonly kind: "new" }
  | { readonly kind: "session"; readonly sessionId: string };

export function parseCloudSessionExtension(
  value: unknown,
): ParseResult<CloudSessionRequest | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") {
    return {
      ok: false,
      message:
        "extensions.cloudSession must be 'auto', 'new' or a cloud session id. Omit it to leave cloud sessions alone.",
    };
  }
  if (text === "auto" || text === "new") return { ok: true, value: { kind: text } };
  return { ok: true, value: { kind: "session", sessionId: text } };
}

export interface DelegateCloudSessions {
  readonly list: Effect.Effect<CloudSessionListResult, CloudSessionFailedError>;
  readonly create: (
    input: CloudSessionCreateInput,
  ) => Effect.Effect<CloudSession, CloudSessionFailedError>;
}

export interface CloudSessionPlacementInput {
  readonly request: CloudSessionRequest;
  readonly projectId: ProjectId;
  /** The child's project repository name; null for a project without one. */
  readonly repositoryName: string | null;
}

export const CHILD_RUNS_HERE_NOTE =
  "The child runs on THIS server, not on the cloud session: running a delegated child on a " +
  "cloud session is not built yet (design: docs/nexi-work/design/delegate-to-cloud-session.md).";

const describeSession = (session: CloudSession) => {
  const name = session.name ?? "Cloud session";
  const state =
    session.phase === "ready"
      ? `ready${session.endsAt === undefined ? "" : ` until ${session.endsAt}`}`
      : `${session.phase}, not ready yet`;
  return `'${name}' (${session.sessionId}) is ${state}`;
};

const failedNote = (error: CloudSessionFailedError) =>
  `No cloud session was used (${error.reason}): ${error.message}`;

/**
 * Starts a session for the project without holding the tool call: a dispatch looks for its run
 * for up to about 40 seconds. The outcome is logged; the session appears in the session list.
 */
const startInBackground = (sessions: DelegateCloudSessions, input: CloudSessionPlacementInput) =>
  sessions
    .create({ durationSeconds: CLOUD_SESSION_HOLD_CEILING_SECONDS, projectId: input.projectId })
    .pipe(
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
        }),
      ),
      Effect.ignore,
      Effect.forkDetach,
      Effect.as(
        "Starting a new cloud session for this project; it appears in the cloud session list once its machine is dispatched.",
      ),
    );

const place = Effect.fn("delegateTask.cloudSession.place")(function* (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
) {
  const { request } = input;
  if (request.kind === "new") return yield* startInBackground(sessions, input);
  const listed = yield* sessions.list;
  if (!listed.configured) {
    return "No cloud session was used: cloud sessions are not set up on this server.";
  }
  if (request.kind === "session") {
    const named = listed.sessions.find((session) => session.sessionId === request.sessionId);
    return named === undefined
      ? `Cloud session ${request.sessionId} is not in your session list; nothing was started.`
      : `Cloud session ${describeSession(named)}.`;
  }
  const fit = selectFittingCloudSession({
    sessions: listed.sessions,
    repositoryName: input.repositoryName,
    nowMs: yield* Clock.currentTimeMillis,
  });
  if (fit !== null) return `Fitting cloud session ${describeSession(fit.session)}.`;
  return yield* startInBackground(sessions, input);
});

/** The notes for one delegation. Never fails: a cloud-session problem never blocks the child. */
export const placeOnCloudSession = (
  sessions: DelegateCloudSessions,
  input: CloudSessionPlacementInput,
): Effect.Effect<ReadonlyArray<string>> =>
  place(sessions, input).pipe(
    Effect.catch((error) => Effect.succeed(failedNote(error))),
    Effect.map((note) => [note, CHILD_RUNS_HERE_NOTE]),
  );
