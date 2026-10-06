import type { ConnectionCatalogEntry } from "@t3tools/client-runtime/connection";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";

/**
 * Saved environments whose cloud session has ended. Connecting to a session saves an environment
 * that names the session (`BrokerConnectionTarget.sessionId`); once the session list shows that
 * session stopped, cancelled or failed, the environment can never connect again and would only
 * linger as "Connection failed". A session missing from the list is left alone: the list is a
 * bounded history, so absence proves nothing.
 */
export function endedCloudSessionEnvironments(
  entries: ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>,
  sessions: ReadonlyArray<CloudSession>,
): ReadonlyArray<EnvironmentId> {
  const ended = new Set(
    sessions
      .filter((session) => isTerminalCloudSessionPhase(session.phase))
      .map((session) => session.sessionId),
  );
  if (ended.size === 0) return [];
  return [...entries]
    .filter(
      ([, entry]) =>
        entry.target._tag === "BrokerConnectionTarget" && ended.has(entry.target.sessionId),
    )
    .map(([environmentId]) => environmentId);
}
