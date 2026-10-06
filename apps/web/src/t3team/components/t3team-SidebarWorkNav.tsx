/**
 * "My work" as an inline item of the sidebar's bottom utility row.
 *
 * It follows the sidebar's project scope: scoped → that project's board, otherwise the
 * cross-project view. The Backlog is not here: it is a segment of the My work view switch (in the
 * project's dashboard header, and in the all-projects view where it asks which project).
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useCallback } from "react";

import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { readScopeFooterActiveEntry } from "~/t3team/t3team-scopeRouteSync.logic";
import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";

const MY_WORK_LABEL = "My work";

export function T3TeamSidebarWorkNavItems() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const scopedProjectId = useT3TeamSidebarProjectScope((state) => state.scopedProjectId);
  // A primitive selection, so only a change of board re-renders the row, not every navigation.
  const activeView = useLocation({
    select: (location) =>
      readScopeFooterActiveEntry(location.pathname, location.search as Record<string, unknown>),
  });

  const openMyWork = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    if (scopedProjectId !== null) {
      void navigate({
        to: "/t3team/projects/$projectId",
        params: { projectId: scopedProjectId },
        search: { projectView: "my-work" },
      });
      return;
    }
    void navigate({ to: "/t3team/my-work" });
  }, [isMobile, navigate, scopedProjectId, setOpenMobile]);

  // The Backlog is a segment of the My work view switch now, so both views light this item.
  const isActive = activeView === "my-work" || activeView === "backlog";

  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              aria-label={MY_WORK_LABEL}
              isActive={isActive}
              onClick={openMyWork}
              size="icon"
            >
              <InboxIcon />
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{MY_WORK_LABEL}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}
