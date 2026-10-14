/**
 * The first-sync progress of an account's projects, folded into the one value the Jira
 * connection surfaces show while the mirror is still catching up.
 */
import {
  readMirrorProgressForAccount,
  type T3TeamMirrorWalkProgress,
} from "./t3team-atlassian-mirrorSyncProgress.ts";

export type T3TeamJiraCatchUp = {
  readonly pagesWalked: number;
  /** How long the most recent page took to fetch and store; a slow Jira shows up here. */
  readonly lastPageMs?: number;
  /** Epoch ms of the Jira change the slowest project has mirrored up to; absent until one is. */
  readonly reachedAt?: number;
};

export function combineCatchUp(
  progress: ReadonlyArray<T3TeamMirrorWalkProgress>,
): T3TeamJiraCatchUp | undefined {
  const latest = progress.reduce<T3TeamMirrorWalkProgress | undefined>(
    (newest, entry) =>
      newest === undefined || entry.lastPageAtMs > newest.lastPageAtMs ? entry : newest,
    undefined,
  );
  if (latest === undefined) return undefined;
  const reached = progress.flatMap((entry) =>
    entry.reachedMs === undefined ? [] : [entry.reachedMs],
  );
  return {
    pagesWalked: progress.reduce((total, entry) => total + entry.pagesWalked, 0),
    ...(latest.lastPageMs !== undefined ? { lastPageMs: latest.lastPageMs } : {}),
    ...(reached.length > 0 ? { reachedAt: Math.min(...reached) } : {}),
  };
}

export const readCatchUpForAccount = (accountId: string) =>
  combineCatchUp(readMirrorProgressForAccount(accountId));
