import { SidebarMenuSub } from "~/t3team/components/ui/t3team-sidebar";

import { ProjectSidebarThreadOverflowToggle } from "./t3team-ProjectSidebarThreadOverflowToggle";
import { ProjectSidebarThreadRowItem } from "./t3team-ProjectSidebarThreadRow";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";
import type { ProjectRowProps } from "./t3team-projectSidebarProjectRowTypes";

type ProjectSidebarProjectThreadSectionProps = {
  projectId: string;
  workspaceRoot: string | null;
  view: ProjectRowProps["view"];
  visibleThreads: ReadonlyArray<ProjectRowProps["projectThreads"][number]>;
  hasOverflowingThreads: boolean;
  expandedThreadList: boolean;
  onExpandedThreadListChange: (expanded: boolean) => void;
  onSelectThread: ProjectRowProps["onSelectThread"];
  onDeleteThread: ProjectRowProps["onDeleteThread"];
  onRenameThread: ProjectRowProps["onRenameThread"];
};

export function ProjectSidebarProjectThreadSection({
  projectId,
  workspaceRoot,
  view,
  visibleThreads,
  hasOverflowingThreads,
  expandedThreadList,
  onExpandedThreadListChange,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: ProjectSidebarProjectThreadSectionProps) {
  const activeThreadId = readActiveThreadIdFromView(view);
  return (
    <SidebarMenuSub className="mx-1 mt-1 mb-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
      {visibleThreads.map((thread) => (
        <ProjectSidebarThreadRowItem
          key={thread.id}
          thread={thread}
          isSelected={activeThreadId === thread.id}
          workspacePath={workspaceRoot}
          projectId={projectId}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          onRenameThread={onRenameThread}
        />
      ))}
      {hasOverflowingThreads ? (
        <ProjectSidebarThreadOverflowToggle
          expanded={expandedThreadList}
          onToggle={() => onExpandedThreadListChange(!expandedThreadList)}
        />
      ) : null}
    </SidebarMenuSub>
  );
}
