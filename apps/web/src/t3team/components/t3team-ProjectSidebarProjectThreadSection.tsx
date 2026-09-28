import { T3SidebarSubList } from "~/t3team/components/ui/t3team-sidebar-row";

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
    <T3SidebarSubList className="mx-1 mt-1 mb-1.5 w-full overflow-hidden">
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
    </T3SidebarSubList>
  );
}
