// @vitest-environment jsdom
import { act } from "react";
import { forwardRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { createMockBackend } from "./backend/t3team-mockBackend";
import type { BackendApi } from "./backend/t3team-types";
import { ProjectDashboardKickoffAside } from "./t3team-ProjectDashboardKickoffAside";

// Counting backend: the aside's composer slash menu and the Quick Starts
// section are two consumers of the same recipe catalog. This suite pins the
// contract that a mount resolves it ONCE.
const { mockUseSidecarComposition, discoverRecipes } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
  discoverRecipes: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => backendRef.current,
}));

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => null,
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
    { getState: () => ({ drainProject: () => [] }) },
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
  ProjectDashboardKickoffComposer: forwardRef(function MockComposer(_props, _ref) {
    return <div>composer</div>;
  }),
}));

vi.mock("~/t3team/t3team-runViewTransition", () => ({
  runT3TeamViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3team/hooks/t3team-useSidecarComposition", () => ({
  useT3TeamSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
}));

vi.mock("~/t3team/t3team-TicketKickoffComposer", () => ({
  createDefaultT3TeamKickoffLaunchConfig: () => ({
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
