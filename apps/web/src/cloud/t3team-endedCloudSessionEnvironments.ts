import type { ConnectionCatalogEntry } from "@t3tools/client-runtime/connection";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";

/**
 * Saved environments whose cloud session has ended. Connecting to a session saves an environment
 * that names the session (`BrokerConnectionTarget.sessionId`); once the session list shows that
 * session stopped, cancelled or failed, the environment can never connect again, so its row says
 * so instead of "Connection failed". Removing it stays the user's call: removal also drops the
 * environment's unsent drafts and cached threads. A session missing from the list is not called
 * ended: the list is a bounded history, so absence proves nothing.
 */
export function endedCloudSessionEnvironmentIds(
  environments: Iterable<{
    readonly environmentId: EnvironmentId;
    readonly entry: Pick<ConnectionCatalogEntry, "target">;
  }>,
  sessions: ReadonlyArray<CloudSession>,
): ReadonlySet<EnvironmentId> {
  const ended = new Set(
    sessions
      .filter((session) => isTerminalCloudSessionPhase(session.phase))
      .map((session) => session.sessionId),
  );
  const result = new Set<EnvironmentId>();
  if (ended.size === 0) return result;
  for (const { environmentId, entry } of environments) {
    if (entry.target._tag === "BrokerConnectionTarget" && ended.has(entry.target.sessionId)) {
      result.add(environmentId);
    }
  }
  return result;
}
