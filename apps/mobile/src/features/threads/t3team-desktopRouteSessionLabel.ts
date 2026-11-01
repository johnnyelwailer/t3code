/**
 * The cloud session a thread belongs to, from the thread's own environment's connection target,
 * named the way the web card names it: "name (#id)". Never from the question or the agent. Any
 * other environment (the user's own computer, a relay) is not a cloud session, and the card says so.
 */
export function desktopRouteSessionLabel(
  target:
    | { readonly _tag: string; readonly label: string; readonly sessionId?: string }
    | undefined,
): string {
  if (target === undefined) return "Unknown environment (not a cloud session)";
  return target._tag === "BrokerConnectionTarget" && target.sessionId !== undefined
    ? `${target.label} (#${target.sessionId})`
    : `${target.label} (not a cloud session)`;
}
