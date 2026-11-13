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
  // A workspace's next session serves the same environment (the snapshot keeps its id): while one
  // is live, the environment has not ended, whichever session it was first connected through.
  const live = new Set(
    sessions
      .filter((session) => !isTerminalCloudSessionPhase(session.phase))
      .flatMap((session) => (session.environmentId === undefined ? [] : [session.environmentId])),
  );
  const result = new Set<EnvironmentId>();
  if (ended.size === 0) return result;
  for (const { environmentId, entry } of environments) {
    if (
      entry.target._tag === "BrokerConnectionTarget" &&
      ended.has(entry.target.sessionId) &&
      !live.has(environmentId)
    ) {
      result.add(environmentId);
    }
  }
  return result;
}

/**
 * Parked on `session_ended`, or the session list shows this environment's session stopped and
 * no live one serves it. The list path covers old threads whose last failure still reads as a
 * refused sign-in; the generic Reconnect banner must not stay.
 */
export function isThreadCloudSessionEnded(input: {
  readonly parkedOnSessionEnded: boolean;
  readonly environmentId: EnvironmentId;
  readonly entry: Pick<ConnectionCatalogEntry, "target"> | null;
  readonly sessions: ReadonlyArray<CloudSession>;
}): boolean {
  if (input.parkedOnSessionEnded) return true;
  if (input.entry === null) return false;
  return endedCloudSessionEnvironmentIds(
    [{ environmentId: input.environmentId, entry: input.entry }],
    input.sessions,
  ).has(input.environmentId);
}
