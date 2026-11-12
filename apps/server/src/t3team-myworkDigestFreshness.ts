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
import type { MirrorSyncLane } from "./t3team-atlassian-mirrorSyncLanes.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

/**
 * Keep this project's mirror loop alive. True when the loop was kicked; a provider that cannot
 * resolve (not Jira, or a dead session) is not the digest's failure and answers false.
 *
 * The "All projects" digest kicks in the background lane, where loops take turns walking Jira
 * (t3team-atlassian-mirrorSyncLanes.ts); one project's own digest walks in the foreground.
 */
export function kickDigestMirrorSync(
  project: Pick<T3TeamMyWorkDigestProjectInput, "account" | "externalProjectId">,
  lane: MirrorSyncLane = "foreground",
) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(project.account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) return false;
    yield* kickT3TeamAtlassianMirrorSync(
      {
        account: project.account,
        externalProjectId: project.externalProjectId,
      },
      { lane },
    );
    return true;
  }).pipe(Effect.orElseSucceed(() => false));
}
