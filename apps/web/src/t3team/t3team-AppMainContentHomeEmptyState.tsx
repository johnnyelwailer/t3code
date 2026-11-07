import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { CreateProjectKickoffThread } from "~/t3team/t3team-kickoffTypes";

import { ProjectBrowserEmptyWithChat } from "./t3team-AppMainContentShell";

export function AppMainContentHomeEmptyState({
  onCreate,
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
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  scratchProject: ProjectShellProject | null;
  onStartScratch: (() => void) | undefined;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffHomeThread: CreateProjectKickoffThread;
}) {
  return (
    <ProjectBrowserEmptyWithChat
      onCreate={onCreate}
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      project={scratchProject}
      onStartScratch={onStartScratch}
      providers={providers}
      isConnected={isConnected}
      onOpenThread={onOpenHomeThread}
      onKickoffProjectThread={onKickoffHomeThread}
    />
  );
}
