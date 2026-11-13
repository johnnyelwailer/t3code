/**
 * Which session the thread's setup card is about when a queued first message and a "Run on" pick
 * disagree. The pick wins over a record parked on a session that is gone: a persisted record from
 * an earlier window would otherwise keep the card — and its "session ended" wording — on the old
 * machine after the user picked a live one.
 */
import type { CloudSession } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

export function resolveCloudSetupSessionId(input: {
  /** The draft's persisted queued send, when it has one. */
  readonly queuedSessionId: string | null;
  /** The in-memory "Run on" pick for this scope. */
  readonly targetSessionId: string | null;
  readonly sessions: readonly CloudSession[];
}): string | null {
  const { queuedSessionId, targetSessionId, sessions } = input;
  if (targetSessionId === null || targetSessionId === CLOUD_SESSION_CREATING_ID) {
    return queuedSessionId ?? targetSessionId;
  }
  if (queuedSessionId === null || queuedSessionId === targetSessionId) return targetSessionId;
  const live = (sessionId: string) =>
    sessions.some(
      (item) => item.sessionId === sessionId && !isTerminalCloudSessionPhase(item.phase),
    );
  return live(queuedSessionId) || !live(targetSessionId) ? queuedSessionId : targetSessionId;
}
