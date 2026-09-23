/**
 * The viewer's last digest visit per scope, in localStorage. The server uses
 * it as the "since" cutoff for status transitions and unhandled review
 * threads, so a returning viewer sees what moved while they were away.
 */

import type { MyWorkDigestScope } from "~/t3team/backend/t3team-myworkDigestBackendApi";

const lastVisitStorageKey = (scope: MyWorkDigestScope) =>
  `t3team.mywork-digest.last-visit.${scope}`;

/** ISO timestamp of the last visit; the epoch when unknown (everything counts as new). */
export function readLastVisitAt(scope: MyWorkDigestScope): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  try {
    const raw = window.localStorage.getItem(lastVisitStorageKey(scope));
    if (raw !== null && Date.parse(raw) > 0) return raw;
  } catch {
    // localStorage may be unavailable (private mode); fall through to the epoch.
  }
  return new Date(0).toISOString();
}

export function writeLastVisitAt(scope: MyWorkDigestScope, at: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastVisitStorageKey(scope), at);
  } catch {
    // Non-fatal: transitions simply widen to "everything" next visit.
  }
}
