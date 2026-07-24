import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { ProjectDashboardKickoffAside } from "./t3team-ProjectDashboardKickoffAside";

const { mockUseSidecarComposition } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => null,
}));

vi.mock("~/t3team/components/ui/t3team-input", () => ({
  Input: ({ placeholder, className }: { placeholder?: string; className?: string }) => (
    <input placeholder={placeholder} className={className} />
  ),
}));

vi.mock("~/t3team/components/ui/t3team-scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("~/t3team/t3team-addToChatStore", () => ({
  useT3TeamAddToChatStore: Object.assign(
    (selector: (state: { pendingByProjectId: Record<string, unknown[]> }) => unknown) =>
      selector({ pendingByProjectId: {} }),
    {
      getState: () => ({
        drainProject: () => [],
      }),
    },
  ),
}));

vi.mock("~/t3team/t3team-AppTicketHelpers", () => ({
  formatRelativeTime: (value: string) => `relative:${value}`,
}));

vi.mock("~/t3team/t3team-contextAttachmentMerge", () => ({
  mergeContextAttachmentsById: ({ current }: { current: readonly unknown[] }) => current,
}));

vi.mock("~/t3team/t3team-EmbeddedThreadAside", () => ({
  EmbeddedThreadAside: () => <div>embedded-thread</div>,
}));

vi.mock("~/t3team/hooks/t3team-createProjectBootstrap", () => ({
  readProjectSetupProfileIdFromProject: () => undefined,
}));

vi.mock("~/t3team/t3team-KickoffRecipeList", () => ({
  T3TeamKickoffRecipeList: () => <div>quick-starts</div>,
}));

vi.mock("~/t3team/t3team-dashboardRecipeActions", () => ({
  resolveT3TeamDashboardRecipeAction: () => null,
  useRunT3TeamDashboardRecipeAction: () => () => undefined,
}));

vi.mock("~/t3team/t3team-ProjectDashboardKickoffComposer", () => ({
  ProjectDashboardKickoffComposer: forwardRef(
    function MockProjectDashboardKickoffComposer(_props, _ref) {
      return <div>composer</div>;
    },
  ),
}));

vi.mock("~/t3team/t3team-runViewTransition", () => ({
  runT3TeamViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3team/hooks/t3team-useSidecarComposition", () => ({
  useT3TeamSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
}));

vi.mock("~/t3team/t3team-sidecarRecipes", () => ({
  useT3TeamSidecarRecipeQuickStarts: () => [],
}));

vi.mock("~/t3team/t3team-TicketKickoffComposer", () => ({
  createDefaultT3TeamKickoffLaunchConfig: () => ({
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
  beforeEach(() => {
    mockUseSidecarComposition.mockReturnValue({
      composition: {
        sections: [
          { sectionId: "quick-starts", visible: true, collapsed: false },
          { sectionId: "recent-conversations", visible: true, collapsed: false },
        ],
      },
      setCollapsed: () => undefined,
      userOverrides: { sections: [] },
      personalization: { composition: { sections: [] }, items: {} },
      hideSection: () => undefined,
      moveSection: () => undefined,
      hideItem: () => undefined,
      pinItem: () => undefined,
      unpinItem: () => undefined,
    });
  });

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
    expect(markup).toContain("Quick starts");
    expect(markup).toContain("Recent conversations");
    expect(markup).toContain("IES-17877 thread 2");
    expect(markup).toContain("relative:2026-05-27T10:00:00.000Z");
    expect(markup).not.toContain("Kick off a project thread");
    expect(markup).not.toContain("Start a focused conversation for");
    expect(markup).not.toContain("0 messages");
    expect(markup).toContain("2 messages • relative:2026-05-27T11:00:00.000Z");
  });
});
