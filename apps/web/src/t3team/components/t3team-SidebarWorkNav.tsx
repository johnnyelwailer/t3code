/**
 * "My work" and "Backlog" as inline items of the sidebar's bottom utility row.
 *
 * Both are always there. "My work" follows the sidebar's project scope: scoped → that project's
 * board, otherwise the cross-project view. A backlog is one project's hierarchy plus its own Jira
 * planning, so without a scope "Backlog" asks which project first instead of flattening several.
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { InboxIcon, ListTreeIcon } from "lucide-react";
import { useCallback, useMemo, type ReactElement, type ReactNode } from "react";

import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { selectBoundProjects } from "~/t3team/t3team-AllProjectsMyWorkView";
import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";

type ProjectView = "my-work" | "backlog";

function WorkNavButton({
  label,
  icon,
  isActive,
  onClick,
  render,
}: {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  onClick?: () => void;
  render?: (button: ReactElement) => ReactElement;
}) {
  const button = (
    <SidebarMenuButton aria-label={label} isActive={isActive} onClick={onClick} size="icon">
      {icon}
    </SidebarMenuButton>
  );
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger render={render ? render(button) : button} />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export function T3TeamSidebarWorkNavItems() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const scopedProjectId = useT3TeamSidebarProjectScope((state) => state.scopedProjectId);
  const { allProjects } = useProjectStore();
  const backlogProjects = useMemo(() => selectBoundProjects(allProjects), [allProjects]);
  const activeView = useLocation({
    select: (location): ProjectView | null => {
      if (location.pathname.startsWith("/t3team/my-work")) return "my-work";
      const view = (location.search as { projectView?: unknown }).projectView;
      return view === "my-work" || view === "backlog" ? view : null;
    },
  });

  const openProjectView = useCallback(
    (projectId: string, projectView: ProjectView) => {
      if (isMobile) setOpenMobile(false);
      void navigate({
        to: "/t3team/projects/$projectId",
        params: { projectId },
        search: { projectView },
      });
    },
    [isMobile, navigate, setOpenMobile],
  );
  const openMyWork = useCallback(() => {
    if (scopedProjectId !== null) return openProjectView(scopedProjectId, "my-work");
    if (isMobile) setOpenMobile(false);
    void navigate({ to: "/t3team/my-work" });
  }, [isMobile, navigate, openProjectView, scopedProjectId, setOpenMobile]);

  return (
    <>
      <WorkNavButton
        label="My work"
        icon={<InboxIcon />}
        isActive={activeView === "my-work"}
        onClick={openMyWork}
      />
      {scopedProjectId !== null ? (
        <WorkNavButton
          label="Backlog"
          icon={<ListTreeIcon />}
          isActive={activeView === "backlog"}
          onClick={() => openProjectView(scopedProjectId, "backlog")}
        />
      ) : (
        <Menu>
          <WorkNavButton
            label="Backlog"
            icon={<ListTreeIcon />}
            isActive={activeView === "backlog"}
            render={(button) => <MenuTrigger render={button} />}
          />
          <MenuPopup side="top" align="start" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Backlog of…</MenuGroupLabel>
              {backlogProjects.length === 0 ? (
                <MenuItem disabled>No project with a backlog yet</MenuItem>
              ) : (
                backlogProjects.map((project) => (
                  <MenuItem key={project.id} onClick={() => openProjectView(project.id, "backlog")}>
                    {project.title}
                  </MenuItem>
                ))
              )}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      )}
    </>
  );
}
