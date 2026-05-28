import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vitest";

import { ProjectDashboardKickoffAside } from "./t3work-ProjectDashboardKickoffAside";

vi.mock("lucide-react", () => ({
  SearchIcon: () => <span>search-icon</span>,
}));

vi.mock("~/t3work/backend/t3work-index", () => ({
  useBackend: () => null,
}));

vi.mock("~/t3work/components/ui/t3work-input", () => ({
  Input: ({ placeholder, className }: { placeholder?: string; className?: string }) => (
    <input placeholder={placeholder} className={className} />
  ),
}));

vi.mock("~/t3work/components/ui/t3work-scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("~/t3work/t3work-addToChatStore", () => ({
  useT3WorkAddToChatStore: Object.assign(
    (selector: (state: { pendingByProjectId: Record<string, unknown[]> }) => unknown) =>
      selector({ pendingByProjectId: {} }),
    {
      getState: () => ({
        drainProject: () => [],
      }),
    },
  ),
}));

vi.mock("~/t3work/t3work-AppTicketHelpers", () => ({
  formatRelativeTime: (value: string) => `relative:${value}`,
}));

vi.mock("~/t3work/t3work-contextAttachmentMerge", () => ({
  mergeContextAttachmentsById: ({ current }: { current: readonly unknown[] }) => current,
}));

vi.mock("~/t3work/t3work-EmbeddedThreadAside", () => ({
  EmbeddedThreadAside: () => <div>embedded-thread</div>,
}));

vi.mock("~/t3work/hooks/t3work-createProjectBootstrap", () => ({
  readProjectSetupProfileIdFromProject: () => undefined,
}));

vi.mock("~/t3work/t3work-KickoffRecipeList", () => ({
  T3workKickoffRecipeList: () => <div>quick-starts</div>,
}));

vi.mock("~/t3work/t3work-dashboardRecipeActions", () => ({
  resolveT3workDashboardRecipeAction: () => null,
  useRunT3workDashboardRecipeAction: () => () => undefined,
}));

vi.mock("~/t3work/t3work-ProjectDashboardKickoffComposer", () => ({
  ProjectDashboardKickoffComposer: forwardRef(
    function MockProjectDashboardKickoffComposer(_props, _ref) {
      return <div>composer</div>;
    },
  ),
}));

vi.mock("~/t3work/t3work-runViewTransition", () => ({
  runT3workViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3work/t3work-sidecarRecipes", () => ({
  useT3workSidecarRecipeQuickStarts: () => [],
}));

vi.mock("~/t3work/t3work-TicketKickoffComposer", () => ({
  createDefaultT3workKickoffLaunchConfig: () => ({
    selection: { model: "gpt-5.4", instanceId: "provider" },
    runtimeMode: "full-access",
    interactionMode: "default",
    selectedToolIds: [],
  }),
}));

const projectId = "project-1";

const project: ProjectShellProject = {
  id: projectId as ProjectShellProject["id"],
  title: "Inbox Export Service",
  source: {
    provider: "local",
    externalProjectId: "project-1",
    raw: {},
  },
  workspace: {
    rootPath: "/tmp/project-1",
    createdAt: "2026-05-27T09:00:00.000Z",
  },
  createdAt: "2026-05-27T09:00:00.000Z",
  updatedAt: "2026-05-27T09:00:00.000Z",
};

describe("ProjectDashboardKickoffAside", () => {
  it("renders recent conversations as compact list entries without a misleading zero count", () => {
    const markup = renderToStaticMarkup(
      <ProjectDashboardKickoffAside
        project={project}
        dashboardMode="my-work"
        projectThreads={[
          {
            id: "thread-zero",
            projectId,
            title: "IES-17877 thread 2",
            messageCount: 0,
            lastMessageAt: "2026-05-27T10:00:00.000Z",
            createdAt: "2026-05-27T10:00:00.000Z",
            status: "idle",
          },
          {
            id: "thread-two",
            projectId,
            title: "New thread",
            messageCount: 2,
            lastMessageAt: "2026-05-27T11:00:00.000Z",
            createdAt: "2026-05-27T11:00:00.000Z",
            status: "idle",
          },
        ]}
        activeThread={null}
        providers={[]}
        isConnected
        onOpenThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onKickoffThread={(() => {}) as never}
      />,
    );

    expect(markup).toContain("<ul");
    expect(markup).toContain("IES-17877 thread 2");
    expect(markup).toContain("relative:2026-05-27T10:00:00.000Z");
    expect(markup).not.toContain("0 messages");
    expect(markup).toContain("2 messages • relative:2026-05-27T11:00:00.000Z");
  });
});
