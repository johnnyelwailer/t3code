import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3work-createLucideReactMock";
import { ProjectDashboardKickoffAside } from "./t3work-ProjectDashboardKickoffAside";

const { mockUseSidecarComposition, mockUseQuickStarts, capturedComposerProps } = vi.hoisted(
  () => ({
    mockUseSidecarComposition: vi.fn(),
    mockUseQuickStarts: vi.fn(),
    capturedComposerProps: { current: null as Record<string, unknown> | null },
  }),
);

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

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
    function MockProjectDashboardKickoffComposer(props, _ref) {
      capturedComposerProps.current = props as Record<string, unknown>;
      return <div>composer</div>;
    },
  ),
}));

vi.mock("~/t3work/t3work-runViewTransition", () => ({
  runT3workViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3work/hooks/t3work-useSidecarComposition", () => ({
  useT3workSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
}));

vi.mock("~/t3work/t3work-sidecarRecipes", () => ({
  useT3workSidecarRecipeQuickStarts: () => mockUseQuickStarts(),
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
  beforeEach(() => {
    capturedComposerProps.current = null;
    mockUseQuickStarts.mockReturnValue([]);
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

  it("hands the surface recipe catalog and the shared staging callback to the composer", () => {
    const qaPlan = {
      id: "create-qa-test-plan",
      title: "Create QA test plan",
      description: "Build a test matrix.",
      prompt: "prompt",
      slashAlias: "qa-plan",
    };
    mockUseQuickStarts.mockReturnValue([qaPlan]);

    renderToStaticMarkup(
      <ProjectDashboardKickoffAside
        project={project}
        dashboardMode="backlog"
        projectThreads={[]}
        activeThread={null}
        providers={[]}
        isConnected
        onOpenThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onKickoffThread={(() => {}) as never}
      />,
    );

    expect(capturedComposerProps.current?.slashRecipes).toEqual([qaPlan]);
    // Same staging entry point the Quick Starts card click uses, so `/qa-plan`
    // and clicking the card both reach the one launch path.
    expect(typeof capturedComposerProps.current?.onSelectSlashRecipe).toBe("function");
    expect(capturedComposerProps.current?.workspaceRoot).toBe("/tmp/project-1");
  });
});
