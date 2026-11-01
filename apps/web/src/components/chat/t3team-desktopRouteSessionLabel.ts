import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

/**
 * The cloud session a thread belongs to, found by the thread's own environment among the user's
 * sessions. Never read from the question or the agent: it takes no question at all.
 */
export function desktopRouteSessionLabel(
  environmentId: EnvironmentId,
  sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId" | "name">>,
): string {
  const matches = sessions.filter((session) => session.environmentId === environmentId);
  const [only] = matches;
  return matches.length === 1 && only !== undefined
    ? `${only.name ?? "Cloud session"} (#${only.sessionId})`
    : "This cloud session";
}
