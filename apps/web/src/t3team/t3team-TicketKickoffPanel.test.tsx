import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { TicketKickoffPanel } from "./t3team-TicketKickoffPanel";

const { mockUseSidecarComposition, flags } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
  flags: { contextStarters: false },
}));

vi.mock("~/t3team/t3team-contextStartersFlag", () => ({
  useContextStartersEnabled: () => flags.contextStarters,
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/components/ui/t3team-scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("~/t3team/components/ui/t3team-input", () => ({
  Input: ({ placeholder, className }: { placeholder?: string; className?: string }) => (
    <input placeholder={placeholder} className={className} />
  ),
}));

vi.mock("~/t3team/t3team-AppTicketHelpers", () => ({
  formatRelativeTime: (value: string) => `relative:${value}`,
}));

vi.mock("~/t3team/t3team-contextAttachmentMerge", () => ({
  mergeContextAttachmentsById: ({ current }: { current: readonly unknown[] }) => current,
}));

vi.mock("~/t3team/components/t3team-ContextAttachmentChip", () => ({
  ContextAttachmentChip: () => <div>context-chip</div>,
}));

vi.mock("~/t3team/t3team-KickoffRecipeList", () => ({
  T3TeamKickoffRecipeList: () => <div>quick-starts</div>,
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

describe("TicketKickoffPanel", () => {
  beforeEach(() => {
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

  function renderPanel() {
    return renderToStaticMarkup(
      <TicketKickoffPanel
        profileId="engineering-copilot"
        projectId="project-1"
        quickStartRecipeInput={{
          backend: null,
          surface: "workitem.detail.sidepanel",
          project,
          selectedWorkLabel: "IES-17877",
        }}
        onOpenThread={() => {}}
        onKickoff={(() => {}) as never}
        renderComposer={({ composerRef }) => <div>composer:{String(Boolean(composerRef))}</div>}
      />,
    );
  }

  it("renders no quick-starts section, only the composer, while CONTEXT_STARTERS is off", () => {
    flags.contextStarters = false;
    const markup = renderPanel();

    expect(markup).not.toContain("Quick starts");
    expect(markup).not.toContain("No sidecar sections");
    expect(markup).toContain("composer:true");
  });

  it("renders quick starts without a recent conversations section", () => {
    flags.contextStarters = true;
    const markup = renderPanel();

    expect(markup).toContain("Quick starts");
    expect(markup).not.toContain("Recent conversations");
    expect(markup).not.toContain("Search conversations");
  });
});
