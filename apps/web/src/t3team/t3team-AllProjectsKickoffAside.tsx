import type { ReactNode } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import { Button } from "~/components/ui/button";

import { bindProjectKickoffThread } from "~/t3team/t3team-bindProjectKickoffThread";
import type { CreateProjectKickoffThread } from "~/t3team/t3team-kickoffTypes";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";

/**
 * Default aside when no PR/ticket is open on the all-projects My Work home: the same generic
 * kickoff host a project dashboard uses when its detail is empty (recipe quick-starts /
 * sidecar), aimed at Scratch ("No project"). Detail only replaces this while something is
 * selected — all-projects vs single-project is irrelevant; empty detail is the condition.
 */
export function AllProjectsKickoffAside({
  scratchProject,
  onStartScratch,
  providers,
  isConnected,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onKickoffProjectThread,
}: {
  scratchProject: ProjectShellProject | null;
  onStartScratch: (() => void) | undefined;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onKickoffProjectThread: CreateProjectKickoffThread;
}): ReactNode {
  if (!scratchProject) {
    return (
      <aside className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 border-l border-border/70 bg-background px-6 text-center text-sm text-muted-foreground">
        {onStartScratch ? (
          <>
            Chat without a project: threads live in the No project folder.
            <Button variant="outline" size="sm" onClick={onStartScratch}>
              Start a chat without a project
            </Button>
          </>
        ) : (
          "Your kickoff chat will appear here once the first project is ready."
        )}
      </aside>
    );
  }
  return (
    <ProjectDashboardKickoffAside
      key={scratchProject.id}
      project={scratchProject}
      dashboardMode="my-work"
      activeThread={null}
      providers={providers}
      isConnected={isConnected}
      onOpenThread={(threadId) => onOpenThread(scratchProject.id, threadId)}
      onOpenFullThread={(threadId) => onOpenFullThread(scratchProject.id, threadId)}
      onThreadKickoffConsumed={onThreadKickoffConsumed}
      onKickoffThread={bindProjectKickoffThread(
        scratchProject.id,
        "my-work",
        onKickoffProjectThread,
      )}
    />
  );
}
