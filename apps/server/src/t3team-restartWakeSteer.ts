/**
 * Post-restart wake steer (restart-resume): when a thread receives a new
 * USER message after a server restart that interrupted its in-flight turn
 * (its session carries the `stoppedByServerRestart` marker the startup
 * session reconcile writes in serverRuntimeStartup.ts), a DETERMINISTIC
 * context block (built in t3team-restartWakeSteerBlock.ts) is prepended to
 * the provider input of that turn: (a) the thread's own in-flight turn was
 * interrupted by the restart; (b) each child thread's live state (running /
 * idle / stopped on restart, last activity, branch + worktree when known);
 * (c) a short steer to check child state and continue.
 *
 * The marker is the ONLY gate — it is written exclusively by the startup
 * reconcile for sessions that had a turn in flight when the server died, so
 * a provider failure or a user stop never sets it. Load failures degrade to
 * NO steer, never to a failed turn. The block is agent context only: the
 * user sees their own message, the agent sees it PLUS the steer (mirror
 * invariant direction: user → agent).
 *
 * @module t3team-restartWakeSteer
 */
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  RESTART_WAKE_STEER_CHILD_CAP,
  buildRestartWakeSteer,
  childSteerState,
  type RestartWakeSteerChild,
} from "./t3team-restartWakeSteerBlock.ts";

export {
  RESTART_WAKE_STEER_CHILD_CAP,
  buildRestartWakeSteer,
  childSteerState,
  type RestartWakeSteerChild,
} from "./t3team-restartWakeSteerBlock.ts";

/** The projection reads the loader needs (structural pick, no adapter). */
export type RestartWakeSteerQuery = Pick<
  ProjectionSnapshotQueryShape,
  "listChildThreadIdsByParent" | "getThreadShellById"
>;

export const loadRestartWakeSteer = (input: {
  readonly thread: {
    readonly id: ThreadId;
    readonly projectId: ProjectId;
    readonly session: { readonly stoppedByServerRestart?: boolean | undefined } | null;
  };
  readonly query: RestartWakeSteerQuery;
}): Effect.Effect<string | null> => {
  if (input.thread.session?.stoppedByServerRestart !== true) {
    return Effect.succeed(null);
  }
  return Effect.gen(function* () {
    const childIds = yield* input.query
      .listChildThreadIdsByParent(input.thread.id, input.thread.projectId)
      .pipe(
        Effect.map((ids) => Option.some(ids.map((id) => String(id)))),
        // A listing failure must NOT claim "no child threads" — no steer.
        Effect.catch(() => Effect.succeed(Option.none())),
      );
    if (Option.isNone(childIds)) return null;
    const limited = childIds.value.slice(0, RESTART_WAKE_STEER_CHILD_CAP);
    const shells = yield* Effect.forEach(
      limited,
      (threadId) =>
        input.query.getThreadShellById(ThreadId.make(threadId)).pipe(
          Effect.map(Option.getOrUndefined),
          Effect.catch(() => Effect.succeed(undefined)),
        ),
      { concurrency: 8 },
    );
    const children = shells.map((shell, index): RestartWakeSteerChild =>
      shell === undefined
        ? {
            threadId: limited[index]!,
            title: "(missing)",
            state: "unknown",
            lastActivityAt: "unknown",
            branch: null,
            worktreePath: null,
          }
        : {
            threadId: String(shell.id),
            title: shell.title,
            state: childSteerState(shell),
            lastActivityAt: shell.updatedAt,
            branch: shell.branch,
            worktreePath: shell.worktreePath,
          },
    );
    return buildRestartWakeSteer({
      children,
      omittedCount: childIds.value.length - limited.length,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("t3team restart wake steer failed to load; skipping it", {
            threadId: input.thread.id,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(null)),
    ),
  );
};
