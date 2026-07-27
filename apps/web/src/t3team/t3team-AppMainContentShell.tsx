import { useEffect, useMemo, type ReactNode } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { useT3TeamActiveChatStore } from "~/t3team/t3team-activeChatStore";
import { createHomeProject } from "~/t3team/t3team-homeProject";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";
import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import { T3TeamSetupWelcomeSurface } from "~/t3team/t3team-SetupWelcomeSurface";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import {
  readActiveThreadIdFromView,
  type ProjectThread,
  type ViewState,
} from "~/t3team/t3team-types";

export function useHomeProjectChat(input: {
  projects: ProjectShellProject[];
  getThreadsForProject: (projectId: string) => ProjectThread[];
}) {
  const { getThreadsForProject } = input;

  const homeChatProject = useMemo(() => createHomeProject(), []);
  const homeChatThreadId = useMemo(() => {
    const existing = getThreadsForProject(homeChatProject.id).toSorted(
      (left, right) =>
        new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
    )[0];
    return existing?.id ?? `project-${homeChatProject.id}-chat`;
  }, [getThreadsForProject, homeChatProject]);

  return {
    homeChatProject,
    homeChatThreadId,
  };
}

export function useSyncActiveChatTarget(input: {
  view: ViewState | null;
  getThreadsForProject: (projectId: string) => ProjectThread[];
  homeChatProject: ProjectShellProject | null;
  homeChatThreadId: string | null;
}) {
  const { view } = input;
  const setActiveChatTarget = useT3TeamActiveChatStore((state) => state.setTarget);

  useEffect(() => {
    if (!view) {
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
  content,
  showInlineCreateWizard = false,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  content?: ReactNode;
  showInlineCreateWizard?: boolean;
  shouldInsetDesktopHeader?: boolean;
}) {
  // The welcome surface beside this header already titles itself with the pack's
  // `labels.appName`; hardcoding the product name here made the distribution read
  // "Set up t3team" next to "Bring your Jira work into Nexi Work".
  const appearance = useT3TeamPackAppearance();
  const productName = appearance?.labels?.appName ?? "t3team";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3TeamMainContentHeaderClassName({
          shouldInsetDesktopHeader,
        })}
      >
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <span className="text-sm font-medium text-muted-foreground/70">
          Set up {productName}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          key={showInlineCreateWizard ? "wizard" : "welcome"}
          className="flex h-full min-h-0 [view-transition-name:t3team-create-project-entry-surface]"
        >
          {content ?? <T3TeamSetupWelcomeSurface onCreate={onCreate} />}
        </div>
      </div>
    </div>
  );
}

export function ProjectBrowserEmptyWithChat({
  onCreate,
  project,
  projectThreads,
  providers,
  isConnected,
  onOpenThread,
  onKickoffThread,
  showAside = true,
  emptyContent,
  showInlineCreateWizard = false,
  shouldInsetDesktopHeader = false,
}: {
  onCreate: () => void;
  project: ProjectShellProject | null;
  projectThreads: ProjectThread[];
  providers: ReadonlyArray<import("@t3tools/contracts").ServerProvider>;
  isConnected: boolean;
  onOpenThread: (threadId: string) => void;
  onKickoffThread: ProjectDashboardKickoffAsideProps["onKickoffThread"];
  showAside?: boolean;
  emptyContent?: ReactNode;
  showInlineCreateWizard?: boolean;
  shouldInsetDesktopHeader?: boolean;
}) {
  if (!showAside) {
    return (
      <ProjectBrowserEmpty
        onCreate={onCreate}
        content={emptyContent}
        showInlineCreateWizard={showInlineCreateWizard}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      />
    );
  }

  return (
    <ResizableRightSidebarLayout
      storageKey="t3team_home_right_sidebar"
      defaultAsideWidth={28 * 16}
      minAsideWidth={24 * 16}
      mobileMainLabel={showInlineCreateWizard ? "Setup" : "Home"}
      mobileAsideLabel="Agent"
      main={
        <ProjectBrowserEmpty
          onCreate={onCreate}
          content={emptyContent}
          showInlineCreateWizard={showInlineCreateWizard}
          shouldInsetDesktopHeader={shouldInsetDesktopHeader}
        />
      }
      aside={
        project ? (
          <ProjectDashboardKickoffAside
            project={project}
            dashboardMode="backlog"
            projectThreads={projectThreads}
            activeThread={null}
            providers={providers}
            isConnected={isConnected}
            onOpenThread={onOpenThread}
            onThreadKickoffConsumed={() => {}}
            onKickoffThread={onKickoffThread}
          />
        ) : (
          <aside className="flex min-h-0 h-full flex-1 items-center justify-center border-l border-border/70 bg-background px-6 text-center text-sm text-muted-foreground">
            Your kickoff chat will appear here once the first project is ready.
          </aside>
        )
      }
    />
  );
}
