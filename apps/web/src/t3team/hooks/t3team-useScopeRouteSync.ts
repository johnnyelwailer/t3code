import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { resolveScopeRouteTarget } from "~/t3team/t3team-scopeRouteSync.logic";

/**
 * Carries a CHANGE of the sidebar project scope onto the active board route: picking a project
 * while looking at "My work" or "Backlog" must show that project's board, not the old one.
 *
 * Fires only on a change after mount (a persisted scope restored at startup is not a pick), and
 * only from the board routes — a thread, ticket or draft stays put so the pick never yanks the user
 * off their work. Every pick path (pills, dropdown, thread-group toggle) lands on the same scope
 * key, so one effect covers them all.
 *
 * `scopeProjectId` is the scoped group's representative id; a key with no resolved group yet
 * (snapshots still loading) is skipped rather than read as "All projects".
 */
export function useT3TeamScopeRouteSync(
  scopeKey: string | null,
  scopeProjectId: string | null,
  scopeMemberProjectIds?: ReadonlyArray<string>,
) {
  const router = useRouter();
  // `resolved`: the current key has been seen with a live group. A persisted key whose project is
  // gone never resolves, so its reset to "All projects" is housekeeping, not a pick to follow.
  const scopeRef = useRef({ key: scopeKey, resolved: scopeProjectId !== null });
  useEffect(() => {
    const previous = scopeRef.current;
    if (previous.key === scopeKey) {
      if (scopeProjectId !== null) {
        previous.resolved = true;
      }
      return;
    }
    if (scopeKey !== null && scopeProjectId === null) {
      return;
    }
    scopeRef.current = { key: scopeKey, resolved: scopeProjectId !== null };
    if (previous.key !== null && !previous.resolved) {
      return;
    }
    const { pathname, search } = router.state.location;
    const target = resolveScopeRouteTarget({
      pathname,
      search: search as Record<string, unknown>,
      scopeProjectId,
      ...(scopeMemberProjectIds ? { scopeMemberProjectIds } : {}),
    });
    if (target !== null) {
      void router.navigate(target);
    }
  }, [router, scopeKey, scopeMemberProjectIds, scopeProjectId]);
}
