import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3work-createLucideReactMock";
import { TicketKickoffPanel } from "./t3work-TicketKickoffPanel";

const { mockUseSidecarComposition } = vi.hoisted(() => ({
  mockUseSidecarComposition: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3work/components/ui/t3work-scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("~/t3work/components/ui/t3work-input", () => ({
  Input: ({ placeholder, className }: { placeholder?: string; className?: string }) => (
    <input placeholder={placeholder} className={className} />
  ),
}));

vi.mock("~/t3work/t3work-AppTicketHelpers", () => ({
  formatRelativeTime: (value: string) => `relative:${value}`,
}));

vi.mock("~/t3work/t3work-contextAttachmentMerge", () => ({
  mergeContextAttachmentsById: ({ current }: { current: readonly unknown[] }) => current,
}));

vi.mock("~/t3work/components/t3work-ContextAttachmentChip", () => ({
  ContextAttachmentChip: () => <div>context-chip</div>,
}));

vi.mock("~/t3work/t3work-KickoffRecipeList", () => ({
  T3workKickoffRecipeList: () => <div>quick-starts</div>,
}));

vi.mock("~/t3work/t3work-runViewTransition", () => ({
  runT3workViewTransition: (callback: () => void) => callback(),
}));

vi.mock("~/t3work/hooks/t3work-useSidecarComposition", () => ({
  useT3workSidecarComposition: (input: unknown) => mockUseSidecarComposition(input),
}));

vi.mock("~/t3work/t3work-sidecarRecipes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/t3work/t3work-sidecarRecipes")>();
  return {
    ...actual,
    useT3workSidecarRecipeQuickStarts: () => [],
  };
});

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
        sections: [{ sectionId: "recent", visible: true, collapsed: false }],
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

  it("renders conversations as compact list entries without a misleading zero count", () => {
    const markup = renderToStaticMarkup(
      <TicketKickoffPanel
        profileId="engineering-copilot"
        projectId="project-1"
        issueThreads={[
          {
            id: "thread-zero",
            projectId: "project-1",
            ticketId: "ticket-1",
            title: "IES-17877 thread 2",
            messageCount: 0,
            lastMessageAt: "2026-05-27T10:00:00.000Z",
            createdAt: "2026-05-27T10:00:00.000Z",
            status: "idle",
          },
          {
            id: "thread-two",
            projectId: "project-1",
            ticketId: "ticket-1",
            title: "New thread",
            messageCount: 2,
            lastMessageAt: "2026-05-27T11:00:00.000Z",
            createdAt: "2026-05-27T11:00:00.000Z",
            status: "idle",
          },
        ]}
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

    expect(markup).toContain("<ul");
    expect(markup).toContain("Recent");
    expect(markup).toContain("IES-17877 thread 2");
    expect(markup).toContain("relative:2026-05-27T10:00:00.000Z");
    expect(markup).not.toContain("Get Help With IES-17877");
    expect(markup).not.toContain(
      "Start a new conversation with all ticket context included automatically.",
    );
    expect(markup).not.toContain("0 messages");
    expect(markup).toContain("2 messages • relative:2026-05-27T11:00:00.000Z");
    expect(markup).not.toContain("Search conversations");
  });
});
