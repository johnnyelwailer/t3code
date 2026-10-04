import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";

/**
 * Matching a saved environment to the live cloud session whose machine it is.
 *
 * The key is the relay environment id the server pins on a ready session
 * (`session.environmentId`) — server-side state, so the match survives a
 * reload. It decides which saved-backend rows are cloud sessions: those rows
 * become read-only connect targets, and the cloud session panel owns their
 * lifecycle (stop, forget). A session whose record carries no id (a workflow
 * predating the marker) matches nothing, so its row stays an ordinary one
 * rather than claiming to be a session it cannot be tied to.
 */
export function liveCloudSessionForEnvironment(
  sessions: readonly CloudSession[],
  machineEnvironmentId: EnvironmentId,
): CloudSession | null {
  const key = String(machineEnvironmentId);
  return (
    sessions.find(
      (session) => session.environmentId === key && !isTerminalCloudSessionPhase(session.phase),
    ) ?? null
  );
}

/**
 * The saved environment a ready session's machine is registered as, so the
 * panel can offer "Forget" for it — the inverse of the match above. `null`
 * when the session carries no id or its machine was never saved, in which
 * case there is nothing to forget and the panel offers no such action.
 */
export function savedEnvironmentForCloudSession<
  E extends { readonly environmentId: EnvironmentId },
>(
  session: Pick<CloudSession, "phase" | "environmentId">,
  savedEnvironments: readonly E[],
): E | null {
  if (session.environmentId === undefined || isTerminalCloudSessionPhase(session.phase)) {
    return null;
  }
  return (
    savedEnvironments.find(
      (environment) => String(environment.environmentId) === session.environmentId,
    ) ?? null
  );
}
