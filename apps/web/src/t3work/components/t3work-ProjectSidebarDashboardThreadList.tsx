import { SidebarMenuSub } from "~/t3work/components/ui/t3work-sidebar";
import type { ProjectThread, ViewState } from "~/t3work/t3work-types";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { getSidebarThreadState } from "./t3work-projectSidebarItemState";

type ProjectSidebarDashboardThreadListProps = {
  projectId: string;
  workspaceRoot: string | null;
  threads: ReadonlyArray<ProjectThread>;
  view: ViewState | null;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
};

export function ProjectSidebarDashboardThreadList({
  projectId,
  workspaceRoot,
  threads,
  view,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: ProjectSidebarDashboardThreadListProps) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <SidebarMenuSub className="mx-1 -mt-0.5 mb-1 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          variant="issue"
          state={getSidebarThreadState({ view, threadId: thread.id })}
          workspacePath={workspaceRoot}
          onSelect={() => onSelectThread(projectId, thread.id)}
          onDelete={() => onDeleteThread(thread.id)}
          onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
        />
      ))}
    </SidebarMenuSub>
  );
}
