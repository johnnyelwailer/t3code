import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3work-createLucideReactMock";
import { AppRecipeManagerPane } from "./t3work-AppRecipeManagerPane";

const { mockUseSidecarComposition } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3work/hooks/t3work-useAddToChat", () => ({
  useAddToChat: () => ({
    addToChatFromRequest: vi.fn(),
  }),
}));

vi.mock("~/t3work/hooks/t3work-useProjectWorkspaceAutoSync", () => ({
  useProjectWorkspaceAutoSync: () => {},
}));

vi.mock("~/t3work/t3work-ProjectRecipeManagerPage", () => ({
  ProjectRecipeManagerPage: () => <div>recipe-manager-page</div>,
}));

vi.mock("~/t3work/t3work-ResizableRightSidebarLayout", () => ({
  ResizableRightSidebarLayout: ({ aside }: { aside: ReactNode }) => <div>{aside}</div>,
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

vi.mock("~/t3work/hooks/t3work-useSidecarComposition", () => ({
  useT3workSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
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
