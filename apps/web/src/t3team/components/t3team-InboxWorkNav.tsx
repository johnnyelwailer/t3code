/**
 * Backlog / My work entry points inside upstream's sidebar (the Work lens).
 *
 * Why this exists: `ProjectSidebarDashboardNav` renders these two entries only in the Code lens's
 * per-project tree. A distribution that ships `sidebarLens: "work"` — which the Nexplore pack does
 * — therefore had NO way to reach either view from the sidebar, even though both are core Team
 * surfaces. This is the same two entries, scoped by the project selector upstream already ships.
 *
 * Scope drives what is offered, because the two views scope differently:
 *  - **My work** is `assignee = currentUser()`. It is meaningful for one project AND across all of
 *    them, so it is always offered.
 *  - **Backlog** is a project's hierarchy plus that project's own Jira planning/filter config.
 *    Flattened across projects it would lose the epic hierarchy that IS the view, so it is offered
 *    only when a single project is scoped.
 *
 * Seam: one line in upstream's `Sidebar.tsx`, mirroring the other three slots in
 * `t3team-InboxSlots.tsx` — the component renders `null` whenever it has nothing to add.
 */
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SidebarMenuSubButton } from "~/t3team/components/ui/t3team-sidebar";
import { isT3TeamShellPath } from "~/t3team/t3team-upstreamRouteBridge";

export type InboxWorkNavProps = {
  /** The scoped project, or `null` when the sidebar is showing all projects. */
  readonly projectId: string | null;
};

export function InboxWorkNav({ projectId }: InboxWorkNavProps): ReactNode {
  const navigate = useNavigate();
  // Upstream mounts this sidebar outside the Team shell too (the plain T3 Code routes); these are
  // Team surfaces, so offer them only where they can actually be opened.
  if (typeof window !== "undefined" && !isT3TeamShellPath(window.location.pathname)) {
    return null;
  }

  return (
    <div className="mx-1 mt-1 mb-1.5 flex w-full flex-col gap-0.5 overflow-hidden px-1.5 py-0.5">
      {projectId === null ? null : (
        <SidebarMenuSubButton
          size="sm"
          className="h-7 w-full translate-x-0 justify-start px-2 text-left text-[11px]"
          onClick={() => {
            void navigate({
              to: "/t3team/projects/$projectId",
              params: { projectId },
              search: { projectView: "backlog" },
            });
          }}
        >
          <span className="truncate">Backlog</span>
        </SidebarMenuSubButton>
      )}
      <SidebarMenuSubButton
        size="sm"
        className="h-7 w-full translate-x-0 justify-start px-2 text-left text-[11px]"
        onClick={() => {
          void (projectId === null
            ? navigate({ to: "/t3team/my-work" })
            : navigate({
                to: "/t3team/projects/$projectId",
                params: { projectId },
                search: { projectView: "my-work" },
              }));
        }}
      >
        <span className="truncate">My work</span>
      </SidebarMenuSubButton>
    </div>
  );
}
