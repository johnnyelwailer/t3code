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

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { kickT3TeamAtlassianMirrorSync } from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import { readT3TeamMirrorSyncStatus } from "./t3team-atlassian-mirrorSyncState.ts";
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
 * When this project's Jira half last matched Jira: the last mirror catch-up
 * walk that reached the end of Jira's change list (persisted, so it survives
 * restarts). `undefined` until one has — a capped or failed walk, or a backlog
 * view sync covering only that view's issues, never counts. The digest shows
 * this instead of its own fetch time, which reads "just now" over a stale mirror.
 */
export function readDigestJiraSyncedAtMs(project: T3TeamMyWorkDigestProjectInput) {
  return readT3TeamMirrorSyncStatus({
    provider: project.account.provider,
    accountId: project.account.id,
    externalProjectId: project.externalProjectId,
  }).pipe(
    Effect.map((status) => status.lastSuccessAtMs),
    Effect.orElseSucceed(() => undefined),
  );
}
