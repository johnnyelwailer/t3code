/**
 * The cloud session a thread belongs to, from the thread's own environment's connection target,
 * named the way the web card names it: "name (#id)". Never from the question or the agent. Null
 * for any other environment (the user's own computer, a relay, one not known yet): it is not a
 * cloud session, so there is nothing to route.
 */
export function desktopRouteSessionLabel(
  target:
    | { readonly _tag: string; readonly label: string; readonly sessionId?: string }
    | undefined,
): string | null {
  return target?._tag === "BrokerConnectionTarget" && target.sessionId !== undefined
    ? `${target.label} (#${target.sessionId})`
    : null;
}
