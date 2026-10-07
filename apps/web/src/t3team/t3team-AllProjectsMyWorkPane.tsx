import { useEffect } from "react";

import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";

import { AllProjectsMyWorkView } from "~/t3team/t3team-AllProjectsMyWorkView";
import { DigestPrAside } from "~/t3team/t3team-DigestPrAside";
import { closeDigestPullRequest, useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import type { ProjectThread } from "~/t3team/t3team-types";

function EmptyDetailAside() {
  return (
    <aside className="flex h-full min-h-0 flex-1 items-center justify-center border-l border-border/70 bg-background px-6 text-center text-sm text-muted-foreground">
      Open a pull request or a work item to see it here.
    </aside>
  );
}

/**
 * The all-projects My Work home with the same detail aside as a project dashboard: a PR or ticket
 * a digest row opens shows beside the digest. Without it, those rows wrote to a store nothing on
 * this screen read, so clicking them did nothing. Each opened item names its project; the aside
 * renders it in that project's context. Collapsed until something is opened.
 */
export function AllProjectsMyWorkPane({
  onOpenTicket,
  getThreadsForProject,
  onRememberEmbeddedThread,
}: {
  onOpenTicket: (projectId: string, ticketId: string) => void;
  getThreadsForProject: (projectId: string) => ProjectThread[];
  onRememberEmbeddedThread: (threadId: string) => void;
}) {
  const { allProjects } = useProjectStore();
  const pullRequest = useDigestPrAsideStore((state) => state.pullRequest);
  const ticket = useDigestPrAsideStore((state) => state.ticket);
  const openedProjectId = ticket?.projectId ?? pullRequest?.projectId ?? null;
  const project =
    openedProjectId === null
      ? null
      : (allProjects.find((candidate) => candidate.id === openedProjectId) ?? null);
  // A detail belongs to the screen it was opened on: leaving this one closes it.
  useEffect(() => closeDigestPullRequest, []);

  return (
    <ResizableRightSidebarLayout
      storageKey="t3team_all_my_work_right_sidebar"
      collapsedStorageKey="t3team:right-sidebar:all-my-work:v1"
      defaultCollapsed
      minAsideWidth={22 * 16}
      defaultAsideWidth={24 * 16}
      minMainWidth={36 * 16}
      mobileMainLabel="My work"
      mobileAsideLabel={pullRequest ? "Pull request" : ticket ? ticket.ticketId : "Details"}
      // Only an item this screen can render reveals the aside (its project may still be loading).
      mobileAsideRequest={project ? (pullRequest ?? ticket) : null}
      main={
        <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <AllProjectsMyWorkView onOpenTicket={onOpenTicket} />
        </div>
      }
      aside={
        project ? (
          <DigestPrAside
            project={project}
            projectThreads={getThreadsForProject(project.id)}
            onRememberEmbeddedThread={onRememberEmbeddedThread}
            fallback={<EmptyDetailAside />}
          />
        ) : (
          <EmptyDetailAside />
        )
      }
    />
  );
}
