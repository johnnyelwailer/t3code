// @vitest-environment jsdom
import { act } from "react";
import { forwardRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3work-createLucideReactMock";
import { createMockBackend } from "./backend/t3work-mockBackend";
import type { BackendApi } from "./backend/t3work-types";
import { ProjectDashboardKickoffAside } from "./t3work-ProjectDashboardKickoffAside";

// Counting backend: the aside's composer slash menu and the Quick Starts
// section are two consumers of the same recipe catalog. This suite pins the
// contract that a mount resolves it ONCE.
const { mockUseSidecarComposition, discoverRecipes } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
  discoverRecipes: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3work/backend/t3work-index", () => ({
  useBackend: () => backendRef.current,
}));

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => null,
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
    { getState: () => ({ drainProject: () => [] }) },
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
  ProjectDashboardKickoffComposer: forwardRef(function MockComposer(_props, _ref) {
    return <div>composer</div>;
  }),
}));

vi.mock("~/t3work/t3work-runViewTransition", () => ({
  runT3workViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3work/hooks/t3work-useSidecarComposition", () => ({
  useT3workSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
}));

vi.mock("~/t3work/t3work-TicketKickoffComposer", () => ({
  createDefaultT3workKickoffLaunchConfig: () => ({
    selection: { model: "gpt-5.4", instanceId: "provider" },
    runtimeMode: "full-access",
    interactionMode: "default",
    selectedToolIds: [],
  }),
}));

const backendRef: { current: BackendApi | null } = { current: null };

const projectId = "project-1";

const project: ProjectShellProject = {
  id: projectId as ProjectShellProject["id"],
  title: "Inbox Export Service",
  source: { provider: "local", externalProjectId: "project-1", raw: {} },
  workspace: { rootPath: "/tmp/project-1", createdAt: "2026-05-27T09:00:00.000Z" },
  createdAt: "2026-05-27T09:00:00.000Z",
  updatedAt: "2026-05-27T09:00:00.000Z",
};

describe("ProjectDashboardKickoffAside recipe discovery", () => {
  beforeEach(() => {
    discoverRecipes.mockReset();
    discoverRecipes.mockResolvedValue({
      workspaceRoot: "/tmp/project-1",
      hasProjectLocalRecipes: false,
      recipes: [],
    });
    const baseBackend = createMockBackend();
    backendRef.current = {
      ...baseBackend,
      projectWorkspace: { ...baseBackend.projectWorkspace, discoverRecipes },
    };
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

  it("discovers project recipes once per mount even though two consumers read the catalog", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(
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
    });

    // Both the composer slash catalog and the Quick Starts card list are
    // rendered, so this asserts sharing rather than one consumer disappearing.
    expect(host.textContent).toContain("composer");
    expect(host.textContent).toContain("quick-starts");
    expect(discoverRecipes).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});
