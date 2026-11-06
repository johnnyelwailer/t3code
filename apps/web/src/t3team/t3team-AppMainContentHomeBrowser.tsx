import type { ProjectShellProject } from "@t3tools/project-context";
import type { ServerProvider } from "@t3tools/contracts";

import { AppMainContentHomeEmptyState } from "~/t3team/t3team-AppMainContentHomeEmptyState";
import type { CreateProjectKickoffThread } from "~/t3team/t3team-kickoffTypes";

export function AppMainContentHomeBrowser({
  onCreate,
  showAside,
  shouldInsetDesktopHeader = false,
  scratchProject,
  onStartScratch,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffProjectThread,
}: {
  onCreate: () => void;
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  /** Upstream's Scratch project ("No project"), once it exists; the home kickoff targets it. */
  scratchProject: ProjectShellProject | null;
  onStartScratch: (() => void) | undefined;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffProjectThread: CreateProjectKickoffThread;
}) {
  return (
    <AppMainContentHomeEmptyState
      onCreate={onCreate}
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      scratchProject={scratchProject}
      onStartScratch={onStartScratch}
      providers={providers}
      isConnected={isConnected}
      onOpenHomeThread={onOpenHomeThread}
      onKickoffHomeThread={onKickoffProjectThread}
    />
  );
}
