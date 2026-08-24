/**
 * t3team: reconcile stale projected sessions at server startup.
 *
 * Provider sessions live in this server process, so none survive a restart —
 * but the event-sourced orchestration projection keeps whatever the last
 * `thread.session-set` said. After a crash or kill mid-turn that is
 * `running`/`starting` FOREVER: the UI shows "Working for Nm" indefinitely,
 * turn admission treats the thread as busy, and the Continue affordance stays
 * hidden until the user manually hits Stop (which dispatches the session-set
 * this module now dispatches automatically).
 *
 * Runs once after the orchestration engine is up: every projected session
 * still claiming live activity is set to `stopped` with its active turn
 * cleared. Adapters that can resume native sessions (Codex, packs with
 * session files) do so lazily on the next turn regardless of this status.
 */
import { CommandId } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

export const reconcileStaleSessionsAtStartup = Effect.fn("t3team.startupSessionReconcile")(
  function* () {
    const query = yield* ProjectionSnapshotQuery;
    const engine = yield* OrchestrationEngineService;
    const crypto = yield* Crypto.Crypto;
    const readModel = yield* query.getCommandReadModel();
    const now = DateTime.formatIso(yield* DateTime.now);

    for (const thread of readModel.threads) {
      const session = thread.session;
      if (session === null) continue;
      if (session.status !== "running" && session.status !== "starting") continue;
      yield* engine
        .dispatch({
          type: "thread.session.set",
          commandId: CommandId.make(yield* crypto.randomUUIDv4),
          threadId: thread.id,
          session: {
            ...session,
            status: "stopped",
            activeTurnId: null,
            updatedAt: now,
          },
          createdAt: now,
        })
        .pipe(
          Effect.tap(() =>
            Effect.logInfo("reconciled stale session to stopped at startup", {
              threadId: thread.id,
              previousStatus: session.status,
            }),
          ),
          Effect.catch((error) =>
            Effect.logWarning("failed to reconcile stale session at startup", {
              threadId: thread.id,
              error: String(error),
            }),
          ),
        );
    }
  },
);
