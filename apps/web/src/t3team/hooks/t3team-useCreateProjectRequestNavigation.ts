import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { createProjectSearchFor } from "~/t3team/t3team-createProjectRouteState";
import { useT3TeamCreateProjectRequestStore } from "~/t3team/t3team-createProjectRequest";
import { T3TEAM_CREATE_PATH } from "~/t3team/t3team-routeState";

/**
 * Turns "open the add-project dialog" requests (raised by the upstream Add-project palette and the
 * sidebar's Jira scope pills, see `t3team-createProjectRequest.ts`) into a navigation to
 * `/t3team/new`, carrying the preselected project when there is one.
 */
export function useCreateProjectRequestNavigation(): void {
  const navigate = useNavigate();
  const router = useRouter();
  const requestId = useT3TeamCreateProjectRequestStore((state) => state.requestId);

  useEffect(() => {
    if (requestId === 0) return;
    const { preselect, clear } = useT3TeamCreateProjectRequestStore.getState();
    clear();
    // Asking again while the dialog is already open moves it, it does not stack a second entry.
    void navigate({
      to: T3TEAM_CREATE_PATH,
      search: preselect ? createProjectSearchFor(preselect) : {},
      replace: router.state.location.pathname === T3TEAM_CREATE_PATH,
    });
  }, [navigate, requestId, router]);
}
