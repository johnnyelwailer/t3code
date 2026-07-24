import { SidebarMenuSub } from "~/t3team/components/ui/t3team-sidebar";

import { ProjectSidebarThreadOverflowToggle } from "./t3team-ProjectSidebarThreadOverflowToggle";
import { ThreadRow } from "./t3team-ProjectSidebarThreadRow";
import { getSidebarThreadState } from "./t3team-projectSidebarItemState";
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
  return (
    <SidebarMenuSub className="mx-1 mt-1 mb-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
      {visibleThreads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          state={getSidebarThreadState({ view, threadId: thread.id })}
          workspacePath={workspaceRoot}
          onSelect={() => onSelectThread(projectId, thread.id)}
          onDelete={() => onDeleteThread(thread.id)}
          onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
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
