import { useEffect } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { useT3TeamActiveChatStore } from "~/t3team/t3team-activeChatStore";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";
import { T3TeamDashboardRecipeActionProvider } from "~/t3team/t3team-dashboardRecipeActions";
import { bindProjectKickoffThread } from "~/t3team/t3team-bindProjectKickoffThread";
import type { CreateProjectKickoffThread } from "~/t3team/t3team-kickoffTypes";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { T3TeamMyWorkNoWorkSourceEmpty } from "~/t3team/t3team-MyWorkNoWorkSourceEmpty";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import { Button } from "~/components/ui/button";
import { readActiveThreadIdFromView, type ViewState } from "~/t3team/t3team-types";

export function useSyncActiveChatTarget(view: ViewState | null) {
  const setActiveChatTarget = useT3TeamActiveChatStore((state) => state.setTarget);

  useEffect(() => {
    // A draft has no project and no server thread yet, and all-my-work has no project at all, so
    // neither has a chat target to publish.
    if (!view || view.type === "draft" || view.type === "all-my-work") {
      setActiveChatTarget(null);
      return;
    }

    const activeThreadId = readActiveThreadIdFromView(view);
    if (activeThreadId) {
      setActiveChatTarget({
        type: "thread",
        projectId: view.projectId,
        threadId: activeThreadId,
      });
      return;
    }

    if (view.type === "ticket") {
      setActiveChatTarget({
        type: "kickoff",
        projectId: view.projectId,
        ticketId: view.ticketId,
      });
      return;
    }

    setActiveChatTarget(null);
  }, [setActiveChatTarget, view]);
}

/** The home without a work project: My Work's own empty state, plus the connect-Jira hint. */
function ProjectBrowserEmpty({
  onCreate,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  shouldInsetDesktopHeader?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3TeamMainContentHeaderClassName({
          shouldInsetDesktopHeader,
        })}
      >
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <span className="text-sm font-medium text-muted-foreground/70">My Work</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          <T3TeamMyWorkNoWorkSourceEmpty onConnect={onCreate} />
        </div>
      </div>
    </div>
  );
}

export function ProjectBrowserEmptyWithChat({
  onCreate,
  project,
  providers,
  isConnected,
  onOpenThread,
  onKickoffProjectThread,
  onStartScratch,
  showAside = true,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  project: ProjectShellProject | null;
  providers: ReadonlyArray<import("@t3tools/contracts").ServerProvider>;
  isConnected: boolean;
  onOpenThread: (threadId: string) => void;
  onKickoffProjectThread: CreateProjectKickoffThread;
  /** Creates the Scratch project the project-less chat lives in, while it does not exist yet. */
  onStartScratch?: (() => void) | undefined;
  showAside?: boolean;
  shouldInsetDesktopHeader?: boolean;
}) {
  if (!showAside) {
    return (
      <ProjectBrowserEmpty
        onCreate={onCreate}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      />
    );
  }

  // The kickoff host runs dashboard recipe actions, so the home is a recipe-action scope too.
  return (
    <T3TeamDashboardRecipeActionProvider>
      <ResizableRightSidebarLayout
        storageKey="t3team_home_right_sidebar"
        defaultAsideWidth={28 * 16}
        minAsideWidth={24 * 16}
        mobileMainLabel="Home"
        mobileAsideLabel="Agent"
        main={
          <ProjectBrowserEmpty
            onCreate={onCreate}
            shouldInsetDesktopHeader={shouldInsetDesktopHeader}
          />
        }
        aside={
          project ? (
            <ProjectDashboardKickoffAside
              project={project}
              dashboardMode="backlog"
              activeThread={null}
              providers={providers}
              isConnected={isConnected}
              onOpenThread={onOpenThread}
              onThreadKickoffConsumed={() => {}}
              onKickoffThread={bindProjectKickoffThread(
                project.id,
                undefined,
                onKickoffProjectThread,
              )}
            />
          ) : (
            <aside className="flex min-h-0 h-full flex-1 flex-col items-center justify-center gap-3 border-l border-border/70 bg-background px-6 text-center text-sm text-muted-foreground">
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
          )
        }
      />
    </T3TeamDashboardRecipeActionProvider>
  );
}
