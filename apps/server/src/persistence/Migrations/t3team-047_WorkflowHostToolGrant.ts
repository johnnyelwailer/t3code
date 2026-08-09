/**
 * Workflow run host-tool grant (draft-bridge policy durability).
 *
 * Adds one nullable column to `workflow_runs`:
 *
 *   • `host_tool_grant` — JSON describing the host-tool bridge the run was LAUNCHED with:
 *     `{"toolGroups": ["mutation.draft", …]}`, or `{"toolGroups": null}` when the launch scoped
 *     no groups. SQL NULL means the run was launched with NO host-tool bridge at all.
 *
 * Why a column rather than inference. Boot rehydration rebuilds a run's CODE from host layers,
 * and it previously decided whether to attach the work-item draft bridge by asking "does this run
 * have a launch thread?". Every ephemeral `t3team.orchestration.run` run has one and none of them
 * are granted the bridge, so a restart silently upgraded a parked run's powers: the same body
 * could propose a draft after the restart that it could not have proposed before it. A grant is
 * launch-time policy, so it has to be recorded at launch to survive; deriving it from whatever
 * else happens to be persisted is what produced the bug.
 *
 * The recipe's `allowedToolGroups` ride along in the same value because the grant is not a
 * boolean — it is "these tools, scoped this way". Reconstructing the bridge without the scope
 * would restore access while dropping the restriction.
 *
 * NULL for every pre-047 row, which is the safe reading: runs that predate the grant column are
 * rehydrated without the bridge rather than being retroactively granted it.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE workflow_runs
    ADD COLUMN host_tool_grant TEXT
  `;
});
