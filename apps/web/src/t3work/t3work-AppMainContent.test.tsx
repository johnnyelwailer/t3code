import type { ProjectShellProject } from "@t3tools/project-context";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppMainContent } from "./t3work-AppMainContent";

const useProjectWorkspaceAutoSyncMock = vi.fn();

vi.mock("~/t3work/backend/t3work-index", () => ({
  useBackendState: () => ({
    providers: [],
    connectionStatus: "connected",
  }),
}));

vi.mock("~/t3work/t3work-AppDashboardPane", () => ({
  AppDashboardPane: ({ project }: { project: { title: string } }) => (
    <div>dashboard:{project.title}</div>
  ),
}));

vi.mock("~/t3work/t3work-AppThreadPane", () => ({
  AppThreadPane: () => <div>thread-pane</div>,
}));

vi.mock("~/t3work/t3work-AppMainContentHomeEmptyState", () => ({
  AppMainContentHomeEmptyState: ({ showAside }: { showAside: boolean }) => (
    <div>home-empty:{showAside ? "aside" : "no-aside"}</div>
  ),
}));

vi.mock("~/t3work/t3work-useThreadResolutionDebug", () => ({
  useThreadResolutionDebug: () => {},
}));

vi.mock("~/t3work/hooks/t3work-useProjectWorkspaceAutoSync", () => ({
  useProjectWorkspaceAutoSync: (input: unknown) => useProjectWorkspaceAutoSyncMock(input),
}));

vi.mock("./t3work-AppMainContentShell", () => ({
  useHomeProjectChat: () => ({
    homeChatProject: null,
    homeChatThreadId: null,
  }),
  useSyncActiveChatTarget: () => {},
}));

const looseProject: ProjectShellProject = {
  id: "project-loose",
  title: "Loose workspace",
  source: {
    provider: "local",
    externalProjectId: "project-loose",
    raw: {},
  },
  workspace: {
    rootPath: "/tmp/loose",
    createdAt: "2026-05-26T00:00:00.000Z",
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
} as never;

const looseProjectThread = {
  id: "thread-loose",
  projectId: "project-loose",
  ticketId: "ticket-1",
  title: "Loose thread",
  messageCount: 0,
  lastMessageAt: "2026-05-26T00:00:00.000Z",
  createdAt: "2026-05-26T00:00:00.000Z",
  status: "idle" as const,
};

describe("AppMainContent", () => {
  beforeEach(() => {
    useProjectWorkspaceAutoSyncMock.mockClear();
  });

  it("passes standalone thread routes to workspace auto-sync", () => {
    renderToStaticMarkup(
      <AppMainContent
        view={{
          type: "thread",
          projectId: looseProject.id,
          threadId: looseProjectThread.id,
        }}
        activeDashboardMode="my-work"
        selectedProjectId={null}
        projects={[]}
        allProjects={[looseProject]}
        getThreadsForProject={(projectId) =>
          projectId === looseProject.id ? [looseProjectThread] : []
        }
        onOpenTicket={() => {}}
        onOpenThread={() => {}}
        onOpenFullThread={() => {}}
        onOpenEmbeddedThread={() => {}}
        onKickoffProjectThread={() => {}}
        onKickoffTicketThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onThreadDisplayModeChange={() => {}}
        onBackToDashboard={() => {}}
        onCreate={() => {}}
        onInlineProjectCreated={() => {}}
        renderDashboard={(project) => <div>dashboard:{project.title}</div>}
        renderTicketDetail={(project, ticketId, activeThreadId) => (
          <div>
            ticket:{project.id}:{ticketId}:{activeThreadId ?? "none"}
          </div>
        )}
      />,
    );

    expect(useProjectWorkspaceAutoSyncMock).toHaveBeenCalledWith({
      project: looseProject,
      projectThreads: [looseProjectThread],
    });
  });

  it("renders a ticket route for a loose workspace project", () => {
    const markup = renderToStaticMarkup(
      <AppMainContent
        view={{
          type: "ticket",
          projectId: looseProject.id,
          ticketId: "ticket-1",
          embeddedThreadId: looseProjectThread.id,
        }}
        activeDashboardMode="my-work"
        selectedProjectId={null}
        projects={[]}
        allProjects={[looseProject]}
        getThreadsForProject={(projectId) =>
          projectId === looseProject.id ? [looseProjectThread] : []
        }
        onOpenTicket={() => {}}
        onOpenThread={() => {}}
        onOpenFullThread={() => {}}
        onOpenEmbeddedThread={() => {}}
        onKickoffProjectThread={() => {}}
        onKickoffTicketThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onThreadDisplayModeChange={() => {}}
        onBackToDashboard={() => {}}
        onCreate={() => {}}
        onInlineProjectCreated={() => {}}
        renderDashboard={(project) => <div>dashboard:{project.title}</div>}
        renderTicketDetail={(project, ticketId, activeThreadId) => (
          <div>
            ticket:{project.id}:{ticketId}:{activeThreadId ?? "none"}
          </div>
        )}
      />,
    );

    expect(markup).toContain("ticket:project-loose:ticket-1:thread-loose");
    expect(markup).not.toContain("home-empty");
  });

  it("reopens the setup welcome surface without the chat sidecar", () => {
    const markup = renderToStaticMarkup(
      <AppMainContent
        view={null}
        activeDashboardMode="my-work"
        selectedProjectId={looseProject.id}
        projects={[looseProject]}
        allProjects={[looseProject]}
        reopenInitialSetup
        getThreadsForProject={(projectId) =>
          projectId === looseProject.id ? [looseProjectThread] : []
        }
        onOpenTicket={() => {}}
        onOpenThread={() => {}}
        onOpenFullThread={() => {}}
        onOpenEmbeddedThread={() => {}}
        onKickoffProjectThread={() => {}}
        onKickoffTicketThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onThreadDisplayModeChange={() => {}}
        onBackToDashboard={() => {}}
        onCreate={() => {}}
        onInlineProjectCreated={() => {}}
        renderDashboard={(project) => <div>dashboard:{project.title}</div>}
        renderTicketDetail={(project, ticketId, activeThreadId) => (
          <div>
            ticket:{project.id}:{ticketId}:{activeThreadId ?? "none"}
          </div>
        )}
      />,
    );

    expect(markup).toContain("home-empty:no-aside");
    expect(markup).not.toContain("dashboard:Loose workspace");
  });
});
