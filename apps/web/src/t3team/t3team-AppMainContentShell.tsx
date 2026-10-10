import { useEffect } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { useT3TeamActiveChatStore } from "~/t3team/t3team-activeChatStore";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";
import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import { T3TeamSetupWelcomeSurface } from "~/t3team/t3team-SetupWelcomeSurface";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import {
  T3TEAM_FIRST_PROJECT_SETUP_REASON,
  type T3TeamSetupSurfaceReason,
} from "~/t3team/t3team-setupSurfaceReason";
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

function ProjectBrowserEmpty({
  onCreate,
  setupSurfaceReason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  setupSurfaceReason?: T3TeamSetupSurfaceReason;
  shouldInsetDesktopHeader?: boolean;
}) {
  // The welcome surface beside this header already titles itself with the pack's
  // `labels.appName`; hardcoding the product name here made the distribution read
  // "Set up t3team" next to "Bring your Jira work into Nexi Work".
  const appearance = useT3TeamPackAppearance();
  const productName = appearance?.labels?.appName ?? "t3team";
  // Projects already exist but none is bound to a work source: this is not a
  // first-run setup, so the header must not claim it is one.
  const headerLabel =
    setupSurfaceReason.kind === "no-work-project"
      ? "Connect a work source"
      : `Set up ${productName}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3TeamMainContentHeaderClassName({
          shouldInsetDesktopHeader,
        })}
      >
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <span className="text-sm font-medium text-muted-foreground/70">{headerLabel}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          <T3TeamSetupWelcomeSurface onCreate={onCreate} reason={setupSurfaceReason} />
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
  onKickoffThread,
  onStartScratch,
  showAside = true,
  setupSurfaceReason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  project: ProjectShellProject | null;
  providers: ReadonlyArray<import("@t3tools/contracts").ServerProvider>;
  isConnected: boolean;
  onOpenThread: (threadId: string) => void;
  onKickoffThread: ProjectDashboardKickoffAsideProps["onKickoffThread"];
  /** Creates the Scratch project the project-less chat lives in, while it does not exist yet. */
  onStartScratch?: (() => void) | undefined;
  showAside?: boolean;
  setupSurfaceReason?: T3TeamSetupSurfaceReason;
  shouldInsetDesktopHeader?: boolean;
}) {
  if (!showAside) {
    return (
      <ProjectBrowserEmpty
        onCreate={onCreate}
        setupSurfaceReason={setupSurfaceReason}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      />
    );
  }

  return (
    <ResizableRightSidebarLayout
      storageKey="t3team_home_right_sidebar"
      defaultAsideWidth={28 * 16}
      minAsideWidth={24 * 16}
      mobileMainLabel="Home"
      mobileAsideLabel="Agent"
      main={
        <ProjectBrowserEmpty
          onCreate={onCreate}
          setupSurfaceReason={setupSurfaceReason}
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
            onKickoffThread={onKickoffThread}
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
  );
}
