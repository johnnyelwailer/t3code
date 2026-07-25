import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { AppRecipeManagerPane } from "./t3team-AppRecipeManagerPane";

const { mockUseSidecarComposition } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/hooks/t3team-useAddToChat", () => ({
  useAddToChat: () => ({
    addToChatFromRequest: vi.fn(),
  }),
}));

vi.mock("~/t3team/hooks/t3team-useProjectWorkspaceAutoSync", () => ({
  useProjectWorkspaceAutoSync: () => {},
}));

vi.mock("~/t3team/t3team-ProjectRecipeManagerPage", () => ({
  ProjectRecipeManagerPage: () => <div>recipe-manager-page</div>,
}));

vi.mock("~/t3team/t3team-ResizableRightSidebarLayout", () => ({
  ResizableRightSidebarLayout: ({ aside }: { aside: ReactNode }) => <div>{aside}</div>,
}));

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

const project: ProjectShellProject = {
  id: "project-1" as ProjectShellProject["id"],
  title: "Recipe Manager Project",
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

describe("AppRecipeManagerPane", () => {
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

  it("wraps the kickoff aside in dashboard recipe action providers", () => {
    const markup = renderToStaticMarkup(
      <AppRecipeManagerPane
        activeDashboardMode="backlog"
        project={project}
        projectThreads={[]}
        activeThread={null}
        activeThreadId={null}
        providers={[]}
        isConnected
        onOpenThread={() => {}}
        onOpenFullThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onRememberEmbeddedThread={() => {}}
        onKickoffProjectThread={() => {}}
        onBackToDashboard={() => {}}
      />,
    );

    expect(markup).toContain("composer");
  });
});
