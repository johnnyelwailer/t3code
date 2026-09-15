import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { ProjectDashboardKickoffAside } from "./t3team-ProjectDashboardKickoffAside";

const { mockUseSidecarComposition, mockUseQuickStarts, capturedComposerProps } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
  mockUseQuickStarts: vi.fn(),
  capturedComposerProps: { current: null as Record<string, unknown> | null },
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
    function MockProjectDashboardKickoffComposer(props, _ref) {
      capturedComposerProps.current = props as Record<string, unknown>;
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
  useT3TeamSidecarRecipeQuickStarts: () => mockUseQuickStarts(),
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
    capturedComposerProps.current = null;
    mockUseQuickStarts.mockReturnValue([]);
    mockUseSidecarComposition.mockReturnValue({
      composition: {
        sections: [{ sectionId: "quick-starts", visible: true, collapsed: false }],
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
