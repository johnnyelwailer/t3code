/**
 * Whether a desktop-route request has expired with its cloud session: the card must stop offering
 * Approve and Deny, and say so, instead of staying actionable on an ended machine.
 */
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import type { EnvironmentLiveState } from "~/cloud/t3team-environmentLiveState";
import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";

/** Shown on the card in place of Approve and Deny. */
export const DESKTOP_ROUTE_EXPIRED_MESSAGE =
  "This request expired with the session and is no longer actionable.";

/**
 * A local thread (this computer) never expires this way. A cloud thread expires when the
 * supervisor already parked on `session_ended`, or when the session list shows that this
 * environment's sessions have all stopped, cancelled or failed. A session missing from the list
 * is not called ended: the list is a bounded history, so absence proves nothing. A later live
 * session for the same environment is not ended.
 */
export function desktopRouteRequestExpired(input: {
  readonly isLocal: boolean;
  readonly liveState?: EnvironmentLiveState;
  readonly environmentId: EnvironmentId;
  readonly sessions: ReadonlyArray<Pick<CloudSession, "environmentId" | "phase">>;
}): boolean {
  if (input.isLocal) return false;
  if (input.liveState === "ended") return true;
  const forEnv = input.sessions.filter((session) => session.environmentId === input.environmentId);
  if (forEnv.length === 0) return false;
  return forEnv.every((session) => isTerminalCloudSessionPhase(session.phase));
}
