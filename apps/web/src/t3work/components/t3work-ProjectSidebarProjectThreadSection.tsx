import { SidebarMenuSub } from "~/t3work/components/ui/t3work-sidebar";

import { ProjectSidebarThreadOverflowToggle } from "./t3work-ProjectSidebarThreadOverflowToggle";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { getSidebarThreadState } from "./t3work-projectSidebarItemState";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

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
