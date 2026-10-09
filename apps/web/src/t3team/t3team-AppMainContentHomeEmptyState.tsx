import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import {
  T3TEAM_FIRST_PROJECT_SETUP_REASON,
  type T3TeamSetupSurfaceReason,
} from "~/t3team/t3team-setupSurfaceReason";

import { ProjectBrowserEmptyWithChat } from "./t3team-AppMainContentShell";

export function AppMainContentHomeEmptyState({
  onCreate,
  setupSurfaceReason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
  showAside,
  shouldInsetDesktopHeader = false,
  scratchProject,
  onStartScratch,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffHomeThread,
}: {
  onCreate: () => void;
  setupSurfaceReason?: T3TeamSetupSurfaceReason;
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  scratchProject: ProjectShellProject | null;
  onStartScratch: (() => void) | undefined;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffHomeThread: ProjectDashboardKickoffAsideProps["onKickoffThread"];
}) {
  return (
    <ProjectBrowserEmptyWithChat
      onCreate={onCreate}
      setupSurfaceReason={setupSurfaceReason}
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      project={scratchProject}
      onStartScratch={onStartScratch}
      providers={providers}
      isConnected={isConnected}
      onOpenThread={onOpenHomeThread}
      onKickoffThread={onKickoffHomeThread}
    />
  );
}
