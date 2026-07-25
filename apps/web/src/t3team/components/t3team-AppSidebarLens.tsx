import { InboxSidebar } from "~/t3team/components/t3team-InboxSidebar";
import { ProjectSidebar } from "~/t3team/components/t3team-ProjectSidebar";
import { useT3TeamSidebarLens } from "~/t3team/t3team-sidebarLens";
import type { ProjectSidebarProps } from "./t3team-projectSidebarTypes";

/**
 * The single place the T3 Team shell decides which sidebar presentation to
 * render. Both lenses sit above the same thread, project and work-item state,
 * so switching never re-mounts the shell or changes the selected thread.
 *
 * - `code` — the Team project/thread tree (upstream's classic hierarchy plus
 *   Team attribution).
 * - `work` — upstream's Inbox, hosted inside the Team shell.
 */
export function AppSidebarLens(props: ProjectSidebarProps) {
  const lens = useT3TeamSidebarLens();
  return lens === "work" ? <InboxSidebar /> : <ProjectSidebar {...props} />;
}
