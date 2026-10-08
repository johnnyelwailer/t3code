import type { ViewState } from "~/t3team/t3team-types";
import type { ProjectSidebarThreadTree } from "./t3team-projectSidebarThreadTree";
import { ProjectSidebarThreadRowItem } from "./t3team-ProjectSidebarThreadRow";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";

type ProjectSidebarThreadTreeRowsProps = {
  projectId: string;
  roots: ProjectSidebarThreadTree["rootThreads"];
  /** Kept so callers still pass the classified tree; children stay off this nav. */
  tree: ProjectSidebarThreadTree;
  view: ViewState | null;
  workspacePath: string | null;
  variant?: "issue";
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
};

export function ProjectSidebarThreadTreeRows({
  projectId,
  roots,
  view,
  workspacePath,
  variant,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: ProjectSidebarThreadTreeRowsProps) {
  const activeThreadId = readActiveThreadIdFromView(view);

  return roots.map((thread) => (
    <ProjectSidebarThreadRowItem
      key={thread.id}
      thread={thread}
      {...(variant ? { variant } : {})}
      isSelected={activeThreadId === thread.id}
      workspacePath={workspacePath}
      projectId={projectId}
      onSelectThread={onSelectThread}
      onDeleteThread={onDeleteThread}
      onRenameThread={onRenameThread}
      wrapWithMenuItem={false}
    />
  ));
}
