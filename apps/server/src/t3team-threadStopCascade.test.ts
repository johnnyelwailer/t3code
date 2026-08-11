import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { loadT3TeamThreadDescendants, stopThreadDescendants } from "./t3team-threadStopCascade.ts";

const layer = it.layer(SqlitePersistenceMemory);

/** Records a `t3team.handoff.started` activity on `parentId` naming `childId`, mirroring what
 * `start_child` and workflow child placement both write (see t3team-workflowChildPlacement.ts). */
function recordHandoffStarted(parentId: string, childId: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_thread_activities (activity_id, thread_id, tone, kind, summary, payload_json, created_at)
      VALUES (
        ${`activity:${parentId}:${childId}`},
        ${parentId},
        'info',
        't3team.handoff.started',
        'Started child session',
        ${`{"parentThreadId":"${parentId}","childThreadId":"${childId}"}`},
        '2026-08-09T00:00:00.000Z'
      )
    `;
  });
}

layer("t3team thread stop cascade", (it) => {
  it.effect("walks a multi-level descendant tree without duplicates", () =>
    Effect.gen(function* () {
      // root -> a, b ; a -> c ; c -> a (cycle guard) ; b -> (none)
      yield* recordHandoffStarted("root", "a");
      yield* recordHandoffStarted("root", "b");
      yield* recordHandoffStarted("a", "c");
      yield* recordHandoffStarted("c", "a");

      const descendants = yield* loadT3TeamThreadDescendants("root");
      assert.deepStrictEqual([...descendants].sort(), ["a", "b", "c"]);
    }),
  );

  it.effect("a thread with no children has no descendants", () =>
    Effect.gen(function* () {
      const descendants = yield* loadT3TeamThreadDescendants("lonely");
      assert.deepStrictEqual(descendants, []);
    }),
  );

  it.effect(
    "dispatches a thread.turn.interrupt to every descendant, tagged with the stop's origin",
    () =>
      Effect.gen(function* () {
        yield* recordHandoffStarted("dispatch-root", "dispatch-child-1");
        yield* recordHandoffStarted("dispatch-root", "dispatch-child-2");
        yield* recordHandoffStarted("dispatch-child-1", "dispatch-grandchild-1");

        const dispatched: unknown[] = [];
        yield* stopThreadDescendants({
          threadId: "dispatch-root",
          createdAt: "2026-08-09T00:00:00.000Z",
          byUser: true,
          dispatch: (command) =>
            Effect.sync(() => {
              dispatched.push(command);
              return { sequence: dispatched.length };
            }),
        });

        const threadIds = dispatched.map((command) => (command as { threadId: string }).threadId);
        assert.deepStrictEqual([...threadIds].sort(), [
          "dispatch-child-1",
          "dispatch-child-2",
          "dispatch-grandchild-1",
        ]);
        for (const command of dispatched) {
          assert.strictEqual((command as { type: string }).type, "thread.turn.interrupt");
          assert.strictEqual((command as { t3teamStopOrigin: string }).t3teamStopOrigin, "user");
        }
      }),
  );

  it.effect("a system-raised (non-user) cascade tags descendants as system, not user", () =>
    Effect.gen(function* () {
      yield* recordHandoffStarted("system-root", "system-child-1");

      const dispatched: unknown[] = [];
      yield* stopThreadDescendants({
        threadId: "system-root",
        createdAt: "2026-08-09T00:00:00.000Z",
        byUser: false,
        dispatch: (command) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      });

      assert.strictEqual(
        (dispatched[0] as { t3teamStopOrigin: string }).t3teamStopOrigin,
        "system",
      );
    }),
  );
});
