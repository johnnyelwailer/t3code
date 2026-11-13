/**
 * Boot gate: never migrate or start a second server while the daily app is on the shared home.
 * Retry re-checks; on success the caller continues the normal boot (migrate, then start).
 */
import type { OldAppPresence } from "./t3team-oldAppPresence.ts";
import type { OldAppGuardState } from "./t3team-oldAppGuardCopy.ts";

export type { OldAppGuardState } from "./t3team-oldAppGuardCopy.ts";

export type HomeGuardSession = {
  readonly setState: (state: OldAppGuardState) => void;
  readonly waitForRetry: () => Promise<void>;
  readonly close?: () => Promise<void> | void;
};

export type HomeGuardInput = {
  readonly detect: () => Promise<OldAppPresence> | OldAppPresence;
  /** Called only after the home is free. Tests assert this is not called while the old app is detected. */
  readonly migrate: () => void;
  readonly present: () => Promise<HomeGuardSession> | HomeGuardSession;
};

export type HomeGuardResult = {
  readonly started: true;
  readonly waitedForOldApp: boolean;
  readonly lastPresence: OldAppPresence;
};

const asPromise = <T>(value: T | Promise<T>): Promise<T> => Promise.resolve(value);

export async function runHomeGuard(input: HomeGuardInput): Promise<HomeGuardResult> {
  const first = await asPromise(input.detect());
  if (!first.running) {
    input.migrate();
    return { started: true, waitedForOldApp: false, lastPresence: first };
  }
  const session = await asPromise(input.present());
  session.setState("blocked");
  try {
    let presence = first;
    while (presence.running) {
      await session.waitForRetry();
      session.setState("retrying");
      presence = await asPromise(input.detect());
      if (presence.running) {
        session.setState("still-running");
      }
    }
    session.setState("continuing");
    input.migrate();
    return { started: true, waitedForOldApp: true, lastPresence: presence };
  } finally {
    await session.close?.();
  }
}

/** Shared lock the daily app already checks: `userdata/server-owner.sqlite`. */
export const SHARED_HOME_LOCK_HELD_BY_RUNNING_SERVER =
  "rc.20's backend holds userdata/server-owner.sqlite (BEGIN EXCLUSIVE) for its lifetime. A lock-aware daily app (rc.17 and later) refuses to start a second server on the same home. Electron's SingletonLock lives in a different userData folder, so rc.20 cannot hold it without speaking Chromium's ProcessSingleton protocol; a daily app that launches will still fail at the ownership lock before opening the databases.";
