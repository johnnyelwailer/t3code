/**
 * Whether a project's Jira half can be trusted this round: the session behind it, when the mirror
 * last matched Jira, and the last sync's failure. Optional on the wire, so hosts that predate it
 * (Nexi Portal, the MCP digest tool) keep reading the payload unchanged.
 *
 * `jiraSyncedAt` is the last mirror catch-up that reached the end of Jira's change list, never the
 * digest's own fetch time, which reads "just now" over a stale mirror. It is absent until the
 * first catch-up completes; a capped or failed walk never counts. Until then, while this round
 * kicked the mirror loop, `jiraSyncPending` says the first sync is still running (the first one
 * after connecting walks the whole project), so the client never reads an empty mirror as done.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import { readJiraSyncStatusForProject } from "./t3team-atlassian-syncStatus.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

export type T3TeamDigestJiraAuth = "ok" | "needs-reconnect";

export type T3TeamDigestJiraHealth = {
  readonly jiraAuth: T3TeamDigestJiraAuth;
  readonly jiraSyncedAt?: string;
  readonly jiraSyncPending?: boolean;
  readonly jiraSyncError?: string;
};

export function readDigestJiraHealth(
  project: T3TeamMyWorkDigestProjectInput,
  mirrorSyncing: boolean,
) {
  return Effect.gen(function* () {
    const sync = yield* readJiraSyncStatusForProject({
      account: project.account,
      externalProjectId: project.externalProjectId,
    });
    const health: T3TeamDigestJiraHealth = {
      jiraAuth: accountNeedsReconnect(project.account.id) ? "needs-reconnect" : "ok",
      ...(sync.lastSyncAt !== undefined
        ? { jiraSyncedAt: DateTime.formatIso(DateTime.makeUnsafe(sync.lastSyncAt)) }
        : mirrorSyncing
          ? { jiraSyncPending: true }
          : {}),
      ...(sync.lastError !== undefined ? { jiraSyncError: sync.lastError } : {}),
    };
    return health;
  });
}
