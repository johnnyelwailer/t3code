import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { type T3TeamAtlassianMirrorSyncRequest } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import {
  clearT3TeamMirrorSyncKickHistory,
  recordT3TeamMirrorSyncKick,
} from "./t3team-atlassian-mirrorSyncIdleTracking.ts";
import { resolveJiraPageSource, runMirrorLoop } from "./t3team-atlassian-mirrorSyncLoop.ts";

export { isT3TeamMirrorSyncIdle } from "./t3team-atlassian-mirrorSyncIdleTracking.ts";

// ─── Single-flight map ───────────────────────────────────────────────────────

type ActiveMirrorSync = { readonly token: symbol };

/**
 * One background loop per (provider|account|project). A second call for the
 * same triple while a loop is running is a no-op.
 */
const activeMirrorSyncs = new Map<string, ActiveMirrorSync>();

export function mirrorSyncMapKey(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}): string {
  return `${input.account.provider}|${input.account.id}|${input.externalProjectId}`;
}

/**
 * Stop every currently-registered mirror sync loop and forget all kick
 * history. Called from the Atlassian auth replace path (basic/OAuth
 * (re)connect, test fixture reset) so a disconnected account's loops don't
 * keep polling Jira with credentials that may no longer be valid for that
 * project. Clearing `activeMirrorSyncs` makes every running loop's
 * `isSuperseded()` check return true on its next iteration; the loop's own
 * `unregister` finalizer is then a no-op (the key is already gone).
 */
export function stopAllT3TeamAtlassianMirrorSyncs(): void {
  activeMirrorSyncs.clear();
  clearT3TeamMirrorSyncKickHistory();
}

/**
 * Test-only visibility into the single-flight map: is a mirror sync loop
 * currently registered for this (provider, account, project) triple? Lets
 * tests assert that a terminated loop released its key (so a later kick can
 * start a fresh loop) without exposing the map itself.
 */
export function hasActiveT3TeamAtlassianMirrorSync(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}): boolean {
  return activeMirrorSyncs.has(mirrorSyncMapKey(input));
}

// ─── Public kick function ─────────────────────────────────────────────────────

/**
 * Kick off the whole-project mirror sync background loop for one project.
 *
 * Single-flight: if a loop is already running for this (provider, account,
 * project) triple the call is a no-op. The loop (t3team-atlassian-mirrorSyncLoop.ts)
 * runs until no kick has been seen for the idle TTL; a later kick restarts it
 * from the persisted watermark.
 */
export function kickT3TeamAtlassianMirrorSync(input: T3TeamAtlassianMirrorSyncRequest) {
  const mapKey = mirrorSyncMapKey(input);
  recordT3TeamMirrorSyncKick(mapKey);
  if (activeMirrorSyncs.has(mapKey)) {
    return Effect.void;
  }

  const token = Symbol(mapKey);
  activeMirrorSyncs.set(mapKey, { token });

  const isSuperseded = () => activeMirrorSyncs.get(mapKey)?.token !== token;
  const unregister = Effect.sync(() => {
    if (activeMirrorSyncs.get(mapKey)?.token === token) {
      activeMirrorSyncs.delete(mapKey);
    }
  });

  return runMirrorLoop(input, mapKey, isSuperseded, resolveJiraPageSource).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3team atlassian mirror sync loop terminated", cause),
    ),
    Effect.ensuring(unregister),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

export {
  computeWatermarkLookbackMinutes,
  nextMirrorSleepMs,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
export type { T3TeamAtlassianMirrorSyncRequest } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
export {
  runMirrorCatchUpWalk,
  runMirrorReconcile,
} from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
export { upsertMirrorIssues } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
