/**
 * How far a project's first sync has got, for the Jira connection surfaces. Held
 * in memory: it describes the walk running in this process right now, and is
 * dropped the moment that walk reaches the end or its loop stops, so a restarted
 * or idle project reads as "not synced" instead of as progress nobody is making.
 * The watermark itself stays the persisted source of truth for resuming.
 */
import * as DateTime from "effect/DateTime";

import type { MirrorSyncIdentity } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";

export type T3TeamMirrorWalkProgress = {
  readonly accountId: string;
  readonly pagesWalked: number;
  readonly lastPageMs: number | undefined;
  /** Newest Jira change durably mirrored by the catch-up so far. */
  readonly reachedMs: number | undefined;
  readonly lastPageAtMs: number;
};

const progressByProject = new Map<string, T3TeamMirrorWalkProgress>();

const projectKey = (identity: MirrorSyncIdentity) =>
  `${identity.provider}|${identity.accountId}|${identity.externalProjectId}`;

const emptyProgress = (identity: MirrorSyncIdentity): T3TeamMirrorWalkProgress => ({
  accountId: identity.accountId,
  pagesWalked: 0,
  lastPageMs: undefined,
  reachedMs: undefined,
  lastPageAtMs: 0,
});

export function recordMirrorPageWalked(identity: MirrorSyncIdentity, durationMs: number): void {
  const previous = progressByProject.get(projectKey(identity)) ?? emptyProgress(identity);
  progressByProject.set(projectKey(identity), {
    ...previous,
    pagesWalked: previous.pagesWalked + 1,
    lastPageMs: durationMs,
    lastPageAtMs: DateTime.nowUnsafe().epochMilliseconds,
  });
}

export function recordMirrorReached(identity: MirrorSyncIdentity, reachedMs: number): void {
  const previous = progressByProject.get(projectKey(identity)) ?? emptyProgress(identity);
  progressByProject.set(projectKey(identity), {
    ...previous,
    reachedMs: Math.max(previous.reachedMs ?? 0, reachedMs),
  });
}

export function clearMirrorProgress(identity: MirrorSyncIdentity): void {
  progressByProject.delete(projectKey(identity));
}

/** Every project of the account whose first sync is still walking. */
export function readMirrorProgressForAccount(
  accountId: string,
): ReadonlyArray<T3TeamMirrorWalkProgress> {
  return [...progressByProject.values()].filter((progress) => progress.accountId === accountId);
}
