import type { ProjectShellProject } from "@t3tools/project-context";
import { SidebarInset, useSidebar } from "~/t3team/components/ui/t3team-sidebar";
import { isElectron } from "~/env";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { AppMainContent } from "~/t3team/t3team-AppMainContent";
import { T3TeamInlineRecipeLaunchProvider } from "~/t3team/t3team-inlineRecipeLaunch";
import { ProjectDashboard } from "~/t3team/t3team-ProjectDashboard";
import { TicketDetailView } from "~/t3team/t3team-TicketDetailView";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThreadDisplayMode, ViewState } from "~/t3team/t3team-types";

export function AppContentPane({
  activeDashboardMode,
  resolvedView,
  store,
  reopenInitialSetup = false,
  onCreate,
  onOpenTicket,
  onOpenThread,
  onOpenFullThread,
  onOpenEmbeddedThread,
  onCloseEmbeddedThread,
  onKickoffProjectThread,
  onKickoffTicketThread,
  onThreadKickoffConsumed,
  onThreadDisplayModeChange,
  onBackToDashboard,
  onManageRepositories,
  onManageRecipes,
}: {
  activeDashboardMode: ProjectDashboardMode;
  resolvedView: ViewState | null;
  store: ReturnType<typeof useProjectStore>;
  reopenInitialSetup?: boolean;
  onCreate: () => void;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onOpenEmbeddedThread: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread?: () => void;
  onKickoffProjectThread: Parameters<typeof AppMainContent>[0]["onKickoffProjectThread"];
  onKickoffTicketThread: Parameters<typeof AppMainContent>[0]["onKickoffTicketThread"];
  onThreadKickoffConsumed: (threadId: string) => void;
  onThreadDisplayModeChange: (threadId: string, displayMode: ProjectThreadDisplayMode) => void;
  onBackToDashboard: (projectId: string) => void;
  onManageRepositories: (projectId: string | null) => void;
  onManageRecipes: (projectId: string) => void;
}) {
  const { isMobile, open } = useSidebar();
  const shouldInsetDesktopHeader = isElectron && !isMobile && !open;

  return (
    <T3TeamInlineRecipeLaunchProvider>
      <SidebarInset className="h-full min-h-0 overflow-hidden bg-background text-foreground">
        <div className="min-h-0 flex-1 overflow-hidden">
          <AppMainContent
            view={resolvedView}
            activeDashboardMode={activeDashboardMode}
            selectedProjectId={store.selectedProjectId}
            projects={store.projects}
            allProjects={store.allProjects}
            reopenInitialSetup={reopenInitialSetup}
            shouldInsetDesktopHeader={shouldInsetDesktopHeader}
            getThreadsForProject={store.getThreadsForProject}
            onOpenTicket={onOpenTicket}
            onOpenThread={onOpenThread}
            onOpenFullThread={onOpenFullThread}
            onOpenEmbeddedThread={onOpenEmbeddedThread}
            {...(onCloseEmbeddedThread ? { onCloseEmbeddedThread } : {})}
            onKickoffProjectThread={onKickoffProjectThread}
            onKickoffTicketThread={onKickoffTicketThread}
            onThreadKickoffConsumed={onThreadKickoffConsumed}
            onThreadDisplayModeChange={onThreadDisplayModeChange}
            onBackToDashboard={onBackToDashboard}
            onCreate={onCreate}
            onInlineProjectCreated={(project) => {
              store.addProject(project);
              onBackToDashboard(project.id);
            }}
            renderDashboard={(project) => (
              <ProjectDashboard
                project={project}
                tickets={[]}
                shouldInsetDesktopHeader={shouldInsetDesktopHeader}
                onOpenTicket={onOpenTicket}
                onManageRepositories={onManageRepositories}
                onManageRecipes={onManageRecipes}
              />
            )}
            renderTicketDetail={(project, ticketId, activeThreadId) => (
              <TicketDetailView
                project={project}
                ticketId={ticketId}
                shouldInsetDesktopHeader={shouldInsetDesktopHeader}
                {...(activeThreadId ? { activeThreadId } : {})}
                projectThreads={store.getThreadsForProject(project.id)}
                onOpenTicket={onOpenTicket}
                onOpenThread={onOpenThread}
                onOpenFullThread={onOpenFullThread}
                onKickoffThread={onKickoffTicketThread}
                onThreadKickoffConsumed={onThreadKickoffConsumed}
                onRememberEmbeddedThread={(threadId) =>
                  onThreadDisplayModeChange(threadId, "embedded")
                }
                onBack={() => onBackToDashboard(project.id)}
              />
            )}
          />
        </div>
      </SidebarInset>
    </T3TeamInlineRecipeLaunchProvider>
  );
}
