import { useEffect } from "react";

import { useBackendState } from "~/t3team/backend/t3team-index";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";

import { AllProjectsKickoffAside } from "~/t3team/t3team-AllProjectsKickoffAside";
import { AllProjectsMyWorkView } from "~/t3team/t3team-AllProjectsMyWorkView";
import { DigestPrAside } from "~/t3team/t3team-DigestPrAside";
import { MyWorkRightPanel } from "~/t3team/t3team-MyWorkRightPanel";
import { closeDigestPullRequest, useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { useT3TeamMyWorkRightPanelEnabled } from "~/t3team/t3team-myWorkRightPanelFlag";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import type { ProjectThread } from "~/t3team/t3team-types";
import { useT3TeamScratchHomeChat } from "~/t3team/t3team-useScratchHomeChat";
import {
  MY_WORK_PANEL_REF,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";

/**
 * The all-projects My Work home with the same detail aside as a project dashboard: a PR or ticket
 * a digest row opens shows beside the digest. When nothing is in detail the aside is the generic
 * kickoff host (recipes / sidecar) — same rule as a single-project dashboard.
 * Collapsed until something is opened (or the user expands it).
 */
export function AllProjectsMyWorkPane({
  onOpenTicket,
  getThreadsForProject,
  onRememberEmbeddedThread,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onKickoffProjectThread,
}: {
  onOpenTicket: (projectId: string, ticketId: string) => void;
  getThreadsForProject: (projectId: string) => ProjectThread[];
  onRememberEmbeddedThread: (threadId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
}) {
  const { allProjects } = useProjectStore();
  const { scratchProject, startScratch } = useT3TeamScratchHomeChat(allProjects);
  const backendState = useBackendState();
  const myWorkRightPanelEnabled = useT3TeamMyWorkRightPanelEnabled();
  const pullRequest = useDigestPrAsideStore((state) => state.pullRequest);
  const ticket = useDigestPrAsideStore((state) => state.ticket);
  const myWorkPanelSurfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, MY_WORK_PANEL_REF).surfaces,
  );
  const openedProjectId = ticket?.projectId ?? pullRequest?.projectId ?? null;
  const project =
    openedProjectId === null
      ? null
      : (allProjects.find((candidate) => candidate.id === openedProjectId) ?? null);
  // A detail belongs to the screen it was opened on: leaving this one closes it.
  useEffect(
    () => () => {
      closeDigestPullRequest();
      useRightPanelStore.getState().closeAllSurfaces(MY_WORK_PANEL_REF);
    },
    [],
  );

  const defaultAside = (
    <AllProjectsKickoffAside
      scratchProject={scratchProject}
      onStartScratch={startScratch}
      providers={backendState.providers}
      isConnected={backendState.connectionStatus === "connected"}
      onOpenThread={onOpenThread}
      onOpenFullThread={onOpenFullThread}
      onThreadKickoffConsumed={onThreadKickoffConsumed}
      onKickoffProjectThread={onKickoffProjectThread}
    />
  );

  const panelRevealRequest =
    (project ? (pullRequest ?? ticket) : null) ??
    (myWorkRightPanelEnabled && myWorkPanelSurfaces.length > 0 ? myWorkPanelSurfaces : null);

  const aside = myWorkRightPanelEnabled ? (
    <MyWorkRightPanel
      project={project}
      projectThreads={project ? getThreadsForProject(project.id) : []}
      onRememberEmbeddedThread={onRememberEmbeddedThread}
      kickoff={defaultAside}
    />
  ) : project ? (
    <DigestPrAside
      project={project}
      projectThreads={getThreadsForProject(project.id)}
      onRememberEmbeddedThread={onRememberEmbeddedThread}
      fallback={defaultAside}
    />
  ) : (
    defaultAside
  );

  return (
    <ResizableRightSidebarLayout
      storageKey="t3team_all_my_work_right_sidebar"
      collapsedStorageKey="t3team:right-sidebar:all-my-work:v1"
      defaultCollapsed
      minAsideWidth={22 * 16}
      defaultAsideWidth={24 * 16}
      minMainWidth={36 * 16}
      mobileMainLabel="My work"
      mobileAsideLabel={pullRequest ? "Pull request" : ticket ? ticket.ticketId : "Agent"}
      // Only an item this screen can render reveals the aside (its project may still be loading).
      mobileAsideRequest={panelRevealRequest}
      main={
        <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <AllProjectsMyWorkView onOpenTicket={onOpenTicket} />
        </div>
      }
      aside={aside}
    />
  );
}
