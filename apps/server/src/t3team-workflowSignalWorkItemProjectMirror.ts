/**
 * The reads the `work-item.project-updates` source makes, all against state the host already keeps:
 * the project's Jira binding (`t3team_project_source_bindings`) and the whole-project backlog mirror
 * (`t3team_atlassian_backlog_issues`) the mirror loop walks every ~90 s. The source never asks Jira
 * for the project itself; it keeps the mirror loop alive the way the digest does and reads its rows.
 *
 * The mirror only moves a row's `updated_at` when Jira's `updatedAt` moved (or the row is new), so
 * "rows with `updated_at` at or after X" is the project's changes since X. Other cache writers can
 * touch a row without a Jira change; the source's field diff drops those.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { ProjectionProjectSourceBindingRepository } from "./persistence/t3team-ProjectionProjectSourceBindings.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { readT3TeamMirrorSyncStatus } from "./t3team-atlassian-mirrorSyncState.ts";
import { kickDigestMirrorSync } from "./t3team-myworkDigestFreshness.ts";

export interface JiraMirrorBinding {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
}

export interface MirrorChangeRow {
  readonly issueKey: string;
  readonly resourceJson: string;
  readonly updatedAt: number;
}

/** The project's Jira binding, or null when it is bound to nothing (or not to Jira). */
export const resolveProjectJiraBinding = Effect.fn("t3team.workItemProjectSignal.binding")(
  function* (projectId: string) {
    const bindings = yield* ProjectionProjectSourceBindingRepository;
    const row = (yield* bindings.listAll()).find((binding) => binding.projectId === projectId);
    if (row === undefined || row.source.provider !== "atlassian" || !("accountId" in row.source)) {
      return null;
    }
    return {
      provider: row.source.provider,
      accountId: row.source.accountId,
      externalProjectId: row.source.externalProjectId,
    } satisfies JiraMirrorBinding;
  },
);

/** Keep the project's mirror loop walking; false when no usable Jira session can drive it. */
export const keepMirrorWalking = (binding: JiraMirrorBinding) =>
  kickDigestMirrorSync(
    {
      account: { id: binding.accountId, provider: binding.provider },
      externalProjectId: binding.externalProjectId,
    },
    "background",
  );

/**
 * Where a new cursor starts: just after the mirror's newest row, once the mirror has caught up at
 * least once (the reads are `>=`, and the newest row is history, not a change).
 * Null before that — the first catch-up inserts the whole project, which must not read as changes.
 */
export const readMirrorBaseline = Effect.fn("t3team.workItemProjectSignal.baseline")(function* (
  binding: JiraMirrorBinding,
) {
  const status = yield* readT3TeamMirrorSyncStatus(binding);
  if (status.lastSuccessAtMs === undefined) return null;
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql<{ readonly latest: number | null }>`
    SELECT MAX(updated_at) AS "latest" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${binding.provider} AND account_id = ${binding.accountId}
      AND external_project_id = ${binding.externalProjectId}`;
  return (row?.latest ?? status.lastSuccessAtMs) + 1;
});

export const readMirrorChangedSince = Effect.fn("t3team.workItemProjectSignal.changed")(function* (
  binding: JiraMirrorBinding,
  sinceMs: number,
  limit: number,
) {
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<MirrorChangeRow>`
    SELECT issue_key AS "issueKey", resource_json AS "resourceJson", updated_at AS "updatedAt"
    FROM t3team_atlassian_backlog_issues
    WHERE provider = ${binding.provider} AND account_id = ${binding.accountId}
      AND external_project_id = ${binding.externalProjectId}
      AND updated_at >= ${sinceMs} AND issue_key IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT ${limit}`;
});
