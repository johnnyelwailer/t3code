/**
 * Whether a project's Jira half can be trusted this round: the session behind it, and the last
 * sync's failure. Optional on the wire, so hosts that predate it (Nexi Portal, the MCP digest tool)
 * keep reading the payload unchanged.
 */
import * as Effect from "effect/Effect";

import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import { readJiraSyncStatusForProject } from "./t3team-atlassian-syncStatus.ts";
import type { T3TeamMyWorkDigestProjectInput } from "./t3team-myworkDigestTypes.ts";

export type T3TeamDigestJiraAuth = "ok" | "needs-reconnect";

export type T3TeamDigestJiraHealth = {
  readonly jiraAuth: T3TeamDigestJiraAuth;
  readonly jiraSyncError?: string;
};

export function readDigestJiraHealth(project: T3TeamMyWorkDigestProjectInput) {
  return Effect.gen(function* () {
    const sync = yield* readJiraSyncStatusForProject({
      account: project.account,
      externalProjectId: project.externalProjectId,
    });
    return {
      jiraAuth: accountNeedsReconnect(project.account.id) ? "needs-reconnect" : "ok",
      ...(sync.lastError !== undefined ? { jiraSyncError: sync.lastError } : {}),
    } satisfies T3TeamDigestJiraHealth;
  });
}
