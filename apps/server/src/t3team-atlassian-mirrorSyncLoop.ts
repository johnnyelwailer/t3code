/**
 * One project's mirror sync loop: a catch-up walk from the persisted watermark
 * every ~90 s (back-to-back while a long gap is being closed), plus a
 * prune-only full reconcile once per ~24 h after the mirror has caught up.
 * Failures are recorded in the persisted sync state and backed off; they never
 * end the loop. Only the idle TTL, supersession, or a non-Jira provider do.
 */
import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import {
  burstPause,
  type MirrorSyncIdentity,
  nextMirrorSleepMs,
  normalSleepMs,
  reconcileIntervalMs,
  type T3TeamAtlassianMirrorSyncRequest,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import {
  type MirrorCatchUpOutcome,
  runMirrorCatchUpWalk,
  runMirrorReconcile,
} from "./t3team-atlassian-backlog-mirrorSyncWalks.ts";
import {
  isT3TeamMirrorSyncIdle,
  lastT3TeamMirrorSyncKickMs,
} from "./t3team-atlassian-mirrorSyncIdleTracking.ts";
import type { MirrorPageSource } from "./t3team-atlassian-mirrorSyncPageWalk.ts";
import { recordT3TeamMirrorSyncFailure } from "./t3team-atlassian-mirrorSyncState.ts";

function describeFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return typeof error.message === "string" ? error.message : String(error.message);
  }
  return String(error);
}

/** Persist and log a failed step; hands the error back so the loop can back off on it. */
function recordStepFailure(identity: MirrorSyncIdentity, step: string, error: unknown) {
  return Effect.gen(function* () {
    yield* Effect.logWarning(`t3team atlassian mirror ${step} failed`, error).pipe(
      Effect.annotateLogs(identity),
    );
    const atMs = yield* Clock.currentTimeMillis;
    yield* recordT3TeamMirrorSyncFailure(identity, {
      message: `${step}: ${describeFailure(error)}`,
      atMs,
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3team atlassian mirror failure could not be recorded", cause),
      ),
    );
    return error;
  });
}

type MirrorSyncPass = MirrorCatchUpOutcome | "not-jira" | { readonly failure: unknown };

/**
 * The account's Jira page source, re-resolved every pass: JiraApiClient freezes
 * its auth at construction, and providerForAccount refreshes an expired OAuth
 * token. `undefined` when the account has no real Atlassian auth.
 */
export const resolveJiraPageSource = (input: T3TeamAtlassianMirrorSyncRequest) =>
  providerForAccount(input.account.id).pipe(
    Effect.map((provider): MirrorPageSource | undefined =>
      provider instanceof AtlassianIntegrationProvider ? provider : undefined,
    ),
  );

export type ResolveMirrorPageSource<E, R> = (
  input: T3TeamAtlassianMirrorSyncRequest,
) => Effect.Effect<MirrorPageSource | undefined, E, R>;

/** One catch-up walk, followed by the prune-only reconcile when `takeReconcileTurn` grants it. */
function runMirrorSyncPass<E, R>(
  input: T3TeamAtlassianMirrorSyncRequest,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
  options: {
    readonly resolveSource: ResolveMirrorPageSource<E, R>;
    readonly takeReconcileTurn: () => boolean;
  },
) {
  return Effect.gen(function* () {
    const source = yield* options.resolveSource(input);
    if (source === undefined) return "not-jira";
    const outcome = yield* runMirrorCatchUpWalk(input, source, identity, isSuperseded);
    if (outcome === "caught-up" && options.takeReconcileTurn()) {
      yield* runMirrorReconcile(input, source, identity, isSuperseded).pipe(
        Effect.catch((error) => recordStepFailure(identity, "reconcile", error)),
      );
    }
    return outcome;
  }).pipe(
    Effect.catch((error) =>
      recordStepFailure(identity, "catch-up", error).pipe(Effect.map((failure) => ({ failure }))),
    ),
  );
}

function nextSleep(
  previousSleepMs: number,
  pass: Exclude<MirrorSyncPass, "not-jira" | "superseded">,
) {
  if (pass === "more-pending") return Duration.toMillis(burstPause);
  return nextMirrorSleepMs(previousSleepMs, pass === "caught-up" ? "ok" : pass.failure);
}

export function runMirrorLoop<E, R>(
  input: T3TeamAtlassianMirrorSyncRequest,
  mapKey: string,
  isSuperseded: () => boolean,
  resolveSource: ResolveMirrorPageSource<E, R>,
) {
  const identity: MirrorSyncIdentity = {
    provider: input.account.provider,
    accountId: input.account.id,
    externalProjectId: input.externalProjectId,
  };

  return Effect.gen(function* () {
    let lastReconcileMs = Number.NEGATIVE_INFINITY;
    let sleepMs = normalSleepMs;

    while (!isSuperseded()) {
      const nowMs = yield* Clock.currentTimeMillis;
      const lastKickedMs = lastT3TeamMirrorSyncKickMs(mapKey) ?? nowMs;
      if (isT3TeamMirrorSyncIdle({ nowMs, lastKickedMs })) {
        yield* Effect.logDebug(
          "t3team atlassian mirror sync: no kick within idle TTL; terminating loop",
        ).pipe(Effect.annotateLogs(identity));
        return;
      }

      const pass = yield* runMirrorSyncPass(input, identity, isSuperseded, {
        resolveSource,
        takeReconcileTurn: () => {
          if (nowMs - lastReconcileMs < reconcileIntervalMs) return false;
          lastReconcileMs = nowMs;
          return true;
        },
      });
      // No real Atlassian auth for this account: end the loop so a kick after
      // connecting starts a fresh one.
      if (pass === "not-jira" || pass === "superseded") return;

      sleepMs = nextSleep(sleepMs, pass);
      yield* Effect.sleep(sleepMs);
    }
  });
}
