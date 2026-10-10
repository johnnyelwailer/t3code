/**
 * What keeps the digest's Jira half truthful.
 *
 * The digest reads the whole-project mirror, and the mirror loop only lives
 * while something keeps kicking it (it idles out otherwise). The digest is My
 * Work's default lens, so it has to kick the loop itself — otherwise a viewer
 * who only ever looks at the digest reads a mirror frozen at whenever another
 * view last ran.
 */

import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import {
  kickT3TeamAtlassianMirrorSync,
  mirrorSyncMapKey,
} from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import { lastT3TeamMirrorWalkMs } from "./t3team-atlassian-mirrorSyncIdleTracking.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

/** Keep this project's mirror loop alive; a provider that cannot resolve is not the digest's failure. */
export function kickDigestMirrorSync(project: T3TeamMyWorkDigestProjectInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(project.account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) return;
    yield* kickT3TeamAtlassianMirrorSync({
      account: project.account,
      externalProjectId: project.externalProjectId,
    });
  }).pipe(Effect.ignore);
}

/**
 * When this project's Jira half last matched Jira: this process's last mirror
 * walk, else — before the first walk of a fresh start — the newest backlog
 * view sync on disk. `undefined` when neither ever happened. The digest shows this instead
 * of its own fetch time, which reads "just now" over a mirror days old.
 */
export function readDigestJiraSyncedAtMs(project: T3TeamMyWorkDigestProjectInput) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly at: number | null }>`
      SELECT MAX(updated_at) AS "at"
      FROM t3team_atlassian_backlog_views
      WHERE provider = ${project.account.provider}
        AND account_id = ${project.account.id}
        AND external_project_id = ${project.externalProjectId}
    `;
    const walked = lastT3TeamMirrorWalkMs(mirrorSyncMapKey(project));
    // A view sync only refreshes that view's issues, so it stands in only until the first walk.
    return walked ?? rows[0]?.at ?? undefined;
  }).pipe(Effect.orElseSucceed(() => undefined));
}
