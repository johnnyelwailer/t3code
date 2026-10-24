/**
 * The durable, write-once record that delegate_task placed a child on a cloud session
 * (`t3team_cloud_child_placements`, migration 117): the session and the repository key derived on
 * this server from the child's project. Only placement writes it (`INSERT … DO NOTHING`: a
 * placement is never rewritten), so after a restart it is what tells a placed child from any other
 * thread whose model selection names a session (`t3team-remoteEnvironmentAuthorize.ts`).
 */
import type { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as SqlClient from "effect/sql/SqlClient";

import type { RemoteEnvironmentPlacement } from "./t3team-remoteEnvironmentPlacements.ts";

export interface CloudChildPlacementMarkers {
  /** Records the placement unless one exists already; never fails the delegation. */
  readonly record: (
    threadId: ThreadId,
    placement: RemoteEnvironmentPlacement,
  ) => Effect.Effect<void>;
  /** The recorded placement, or undefined when none (or the store cannot be read). */
  readonly read: (threadId: ThreadId) => Effect.Effect<RemoteEnvironmentPlacement | undefined>;
}

export const makeSqlCloudChildPlacementMarkers = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    record: (threadId, placement) =>
      Effect.flatMap(
        DateTime.now,
        (now) =>
          sql`
          INSERT INTO t3team_cloud_child_placements
            (child_thread_id, session_id, repository_key, created_at)
          VALUES (${threadId}, ${placement.sessionId}, ${placement.repositoryKey},
            ${DateTime.formatIso(now)})
          ON CONFLICT (child_thread_id) DO NOTHING
        `,
      ).pipe(
        Effect.asVoid,
        Effect.catchCause((cause) =>
          Effect.logWarning("cloud child placement marker could not be written", { cause }),
        ),
      ),
    read: (threadId) =>
      sql<{ readonly sessionId: string; readonly repositoryKey: string }>`
        SELECT session_id AS "sessionId", repository_key AS "repositoryKey"
        FROM t3team_cloud_child_placements
        WHERE child_thread_id = ${threadId}
      `.pipe(
        Effect.map((rows) => rows[0]),
        Effect.catchCause(() => Effect.succeed(undefined)),
      ),
  } satisfies CloudChildPlacementMarkers;
});

/** In memory, for tests: survives a "restart" of the registry when shared across it. */
export const makeMemoryCloudChildPlacementMarkers = Effect.gen(function* () {
  const rows = yield* Ref.make(new Map<ThreadId, RemoteEnvironmentPlacement>());
  return {
    record: (threadId, placement) =>
      Ref.update(rows, (current) =>
        current.has(threadId) ? current : new Map(current).set(threadId, placement),
      ),
    read: (threadId) => Effect.map(Ref.get(rows), (current) => current.get(threadId)),
  } satisfies CloudChildPlacementMarkers;
});
