import { ATLASSIAN_OAUTH_FLOW_TTL_MS } from "@t3tools/integrations-atlassian";

/**
 * Pending server-owned Atlassian OAuth flows, keyed by `state`.
 *
 * The flow used to belong to the tab that started it: that tab generated the PKCE verifier, so
 * sign-in had to finish in the same browser profile. Holding the verifier here instead is what lets
 * the user finish sign-in wherever their Atlassian session actually lives — another browser, another
 * profile, a phone — because the only thing that has to travel is the `state`.
 *
 * In memory only, deliberately. A verifier is a bearer credential for exactly one authorization
 * code; written to disk or SQLite it would outlive the window it is useful for and turn a file read
 * into a way to finish somebody else's sign-in. Losing pending flows on restart is the right trade —
 * the user simply starts again.
 */
export type PendingAtlassianOAuthFlow = {
  readonly state: string;
  readonly codeVerifier: string;
  readonly authorizeUrl: string;
  readonly redirectUri: string;
  readonly createdAtMs: number;
};

/**
 * Deliberately re-exported rather than redeclared: the client waits for exactly this long, so the
 * number has to have one home. See `ATLASSIAN_OAUTH_FLOW_TTL_MS` in `@t3tools/integrations-atlassian`.
 */
export { ATLASSIAN_OAUTH_FLOW_TTL_MS };

/**
 * Hard ceiling on pending flows. Anyone who can reach the server can POST `begin`, so without a cap
 * a loop would grow this map until the process died. A handful of concurrent sign-ins is already
 * generous for one desktop app, and evicting the oldest costs the user nothing worse than restarting
 * a sign-in they had already walked away from.
 */
export const ATLASSIAN_OAUTH_FLOW_MAX_PENDING = 16;

const pendingFlows = new Map<string, PendingAtlassianOAuthFlow>();

/**
 * Swept on every access rather than on a timer: there is no fiber to own a timer here, and a flow
 * that is never looked at again costs one small record until the next `begin` sweeps it out.
 */
function sweepExpiredFlows(nowMs: number): void {
  for (const [state, flow] of pendingFlows) {
    if (nowMs - flow.createdAtMs >= ATLASSIAN_OAUTH_FLOW_TTL_MS) {
      pendingFlows.delete(state);
    }
  }
}

/** Insertion order is age order: entries are never re-set under an existing key. */
function evictOldestFlowsOverCap(): void {
  while (pendingFlows.size > ATLASSIAN_OAUTH_FLOW_MAX_PENDING) {
    const oldest = pendingFlows.keys().next();
    if (oldest.done === true) return;
    pendingFlows.delete(oldest.value);
  }
}

export function putPendingAtlassianOAuthFlow(flow: PendingAtlassianOAuthFlow, nowMs: number): void {
  sweepExpiredFlows(nowMs);
  pendingFlows.set(flow.state, flow);
  evictOldestFlowsOverCap();
}

/**
 * Look up a flow without spending it. Used by the shareable `begin/:state` redirect, which the user
 * may legitimately open more than once — a reload, a bounce back from Atlassian, a link opened on
 * the wrong device first. Only `complete` spends a flow.
 */
export function readPendingAtlassianOAuthFlow(
  state: string,
  nowMs: number,
): PendingAtlassianOAuthFlow | undefined {
  sweepExpiredFlows(nowMs);
  return pendingFlows.get(state);
}

/**
 * Take the flow out of the map and return it. Single use: a replayed `state` finds nothing, so a
 * captured callback URL cannot be redeemed twice even inside the TTL window.
 */
export function consumePendingAtlassianOAuthFlow(
  state: string,
  nowMs: number,
): PendingAtlassianOAuthFlow | undefined {
  sweepExpiredFlows(nowMs);
  const flow = pendingFlows.get(state);
  if (flow) {
    pendingFlows.delete(state);
  }
  return flow;
}

export function pendingAtlassianOAuthFlowCount(): number {
  return pendingFlows.size;
}

export type AtlassianOAuthFlowStatus = "pending" | "completed" | "unknown";

/**
 * How long a completed flow stays observable after `consumePendingAtlassianOAuthFlow` removes it from
 * `pendingFlows`. Long enough that a ~2s poller from the tab that could not see the popup succeed is
 * certain to observe the terminal state at least once; short enough that it does not become a second
 * unbounded map. Bounded the same way `pendingFlows` is: swept on access, not on a timer.
 */
export const ATLASSIAN_OAUTH_FLOW_COMPLETED_RETENTION_MS = 2 * 60 * 1000;

/** state -> the time it completed. Disjoint from `pendingFlows`: a state lives in exactly one map. */
const completedFlows = new Map<string, number>();

function sweepExpiredCompletedFlows(nowMs: number): void {
  for (const [state, completedAtMs] of completedFlows) {
    if (nowMs - completedAtMs >= ATLASSIAN_OAUTH_FLOW_COMPLETED_RETENTION_MS) {
      completedFlows.delete(state);
    }
  }
}

/**
 * Records that `state` finished successfully. Called once, right after the flow is consumed and its
 * accounts persisted — never on a failed exchange, which puts the flow back as pending instead so the
 * same link can be retried.
 */
export function markAtlassianOAuthFlowCompleted(state: string, nowMs: number): void {
  sweepExpiredCompletedFlows(nowMs);
  completedFlows.set(state, nowMs);

  /*
    Same hard ceiling as `pendingFlows`. Reaching this needs a *successful* token exchange against a
    live pending state, and pending is capped at 16, so unbounded growth was never really reachable —
    but a map with a sweep and no ceiling is one behaviour change away from being a leak, and the
    oldest completion is always the least useful to a poller.
  */
  while (completedFlows.size > ATLASSIAN_OAUTH_FLOW_MAX_PENDING) {
    const oldest = completedFlows.keys().next();
    if (oldest.done) break;
    completedFlows.delete(oldest.value);
  }
}

/**
 * What a poller watching one `state` should be told: still pending, finished, or nothing this server
 * remembers — a state it never issued, one that expired, or one whose completed marker aged out.
 * Distinguishing `unknown` from `pending` is the whole point: it lets a waiting tab stop and say the
 * link expired instead of polling forever.
 */
export function readAtlassianOAuthFlowStatus(state: string, nowMs: number): AtlassianOAuthFlowStatus {
  sweepExpiredCompletedFlows(nowMs);
  if (completedFlows.has(state)) return "completed";
  return readPendingAtlassianOAuthFlow(state, nowMs) ? "pending" : "unknown";
}

/** Test hook: the maps are module state shared by every route in the process. */
export function resetPendingAtlassianOAuthFlows(): void {
  pendingFlows.clear();
  completedFlows.clear();
}
