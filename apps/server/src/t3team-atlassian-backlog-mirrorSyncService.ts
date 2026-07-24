import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import {
  nextMirrorSleepMs,
  normalSleepMs,
  reconcileIntervalMs,
  type T3TeamAtlassianMirrorSyncRequest,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import { computeIncrementalLookbackMinutes } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import {
  runMirrorIncrementalWalk,
  runMirrorReconcile,
} from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
import {
  clearT3TeamMirrorSyncKickHistory,
  isT3TeamMirrorSyncIdle,
  lastT3TeamMirrorSyncKickMs,
  recordT3TeamMirrorSyncKick,
} from "./t3team-atlassian-mirrorSyncIdleTracking.ts";

export { isT3TeamMirrorSyncIdle } from "./t3team-atlassian-mirrorSyncIdleTracking.ts";

// ─── Single-flight map ───────────────────────────────────────────────────────

type ActiveMirrorSync = { readonly token: symbol };

/**
 * One background loop per (provider|account|project). A second call for the
 * same triple while a loop is running is a no-op.
 */
const activeMirrorSyncs = new Map<string, ActiveMirrorSync>();

function mirrorSyncMapKey(input: {
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
 * project) triple the call is a no-op. The loop runs indefinitely until the
 * process exits, sleeping ~90 s between incremental walks and doing a full
 * reconcile every ~24 h.
 *
 * Nothing calls this yet — Wave 3 wires it into the My Work endpoint.
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

  return runMirrorLoop(input, isSuperseded).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3team atlassian mirror sync loop terminated", cause),
    ),
    Effect.ensuring(unregister),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

// ─── Main loop ───────────────────────────────────────────────────────────────

function runMirrorLoop(input: T3TeamAtlassianMirrorSyncRequest, isSuperseded: () => boolean) {
  const identity = {
    provider: input.account.provider,
    accountId: input.account.id,
    externalProjectId: input.externalProjectId,
  };

  return Effect.gen(function* () {
    let lastReconcileMs = 0;
    let lastSuccessfulWalkMs = 0;
    let sleepMs = normalSleepMs;

    const mapKey = mirrorSyncMapKey(input);

    while (true) {
      if (isSuperseded()) return;

      const idleNowMs = yield* Clock.currentTimeMillis;
      const lastKickedMs = lastT3TeamMirrorSyncKickMs(mapKey) ?? idleNowMs;
      if (isT3TeamMirrorSyncIdle({ nowMs: idleNowMs, lastKickedMs })) {
        yield* Effect.logDebug(
          "t3team atlassian mirror sync: no kick within idle TTL; terminating loop",
        ).pipe(Effect.annotateLogs(identity));
        return;
      }

      // Re-resolve the provider every iteration instead of using a captured
      // instance: JiraApiClient freezes its auth at construction (no
      // in-place refresh), so a provider resolved once at kick time goes
      // stale as soon as the OAuth access token expires (~1h). Re-resolving
      // via providerForAccount re-reads persisted auth and runs
      // refreshOAuthAuthIfNeeded, so a refreshed token is picked up here.
      const provider = yield* providerForAccount(input.account.id);

      if (!(provider instanceof AtlassianIntegrationProvider)) {
        // Resolved to the mock provider (no real Atlassian auth persisted
        // for this account) — nothing to walk. Terminate so the single-flight
        // map unblocks a future kick once real auth is available, rather
        // than looping forever on a walk that can never succeed.
        yield* Effect.logDebug(
          "t3team atlassian mirror sync: resolved provider is not an AtlassianIntegrationProvider; terminating loop",
        ).pipe(Effect.annotateLogs(identity));
        return;
      }

      const nowMs = yield* Clock.currentTimeMillis;
      const doReconcile = nowMs - lastReconcileMs >= reconcileIntervalMs;

      if (doReconcile) {
        // A reconcile covers everything an incremental walk would, so on
        // success it also counts as a successful walk for lookback purposes.
        const outcome = yield* runMirrorReconcile(input, provider, identity, isSuperseded).pipe(
          Effect.andThen(
            Effect.sync(() => {
              lastSuccessfulWalkMs = nowMs;
              return "ok" as const;
            }),
          ),
          Effect.catch((error) =>
            Effect.logWarning("t3team atlassian mirror reconcile walk failed", error).pipe(
              Effect.as(error),
            ),
          ),
        );
        sleepMs = nextMirrorSleepMs(sleepMs, outcome);
        lastReconcileMs = yield* Clock.currentTimeMillis;
      } else {
        // Widen the JQL lookback to cover the gap since the last successful
        // walk (laptop suspend, failed walks) instead of a fixed 15 m window.
        // Anchor to the walk's *start* so updates landing mid-walk aren't
        // skipped by the next window.
        const lookbackMinutes = computeIncrementalLookbackMinutes({
          nowMs,
          lastSuccessfulWalkMs,
        });
        const outcome = yield* runMirrorIncrementalWalk(
          input,
          provider,
          identity,
          isSuperseded,
          lookbackMinutes,
        ).pipe(
          Effect.andThen(
            Effect.sync(() => {
              lastSuccessfulWalkMs = nowMs;
              return "ok" as const;
            }),
          ),
          Effect.catch((error) =>
            Effect.logWarning("t3team atlassian mirror incremental walk failed", error).pipe(
              Effect.as(error),
            ),
          ),
        );
        sleepMs = nextMirrorSleepMs(sleepMs, outcome);
      }

      if (isSuperseded()) return;
      yield* Effect.sleep(sleepMs);
    }
  });
}

export {
  computeIncrementalLookbackMinutes,
  nextMirrorSleepMs,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
export type { T3TeamAtlassianMirrorSyncRequest } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
export { runMirrorReconcile } from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
export { upsertMirrorIssues } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
