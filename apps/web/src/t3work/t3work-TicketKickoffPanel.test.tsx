import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TicketKickoffPanel } from "./t3work-TicketKickoffPanel";

vi.mock("lucide-react", () => ({
  SearchIcon: () => <span>search-icon</span>,
}));

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

vi.mock("~/t3work/t3work-TicketKickoffComposer", () => ({
  createDefaultT3workKickoffLaunchConfig: () => ({
    selection: { model: "gpt-5.4", instanceId: "provider" },
    runtimeMode: "full-access",
    interactionMode: "default",
    selectedToolIds: [],
  }),
}));

describe("TicketKickoffPanel", () => {
  it("renders conversations as compact list entries without a misleading zero count", () => {
    const markup = renderToStaticMarkup(
      <TicketKickoffPanel
        displayId="IES-17877"
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
        quickStartRecipes={[]}
        onOpenThread={() => {}}
        onKickoff={(() => {}) as never}
        renderComposer={({ composerRef }) => <div>composer:{String(Boolean(composerRef))}</div>}
      />,
    );

    expect(markup).toContain("Conversations");
    expect(markup).toContain("<ul");
    expect(markup).toContain("IES-17877 thread 2");
    expect(markup).toContain("relative:2026-05-27T10:00:00.000Z");
    expect(markup).not.toContain("0 messages");
    expect(markup).toContain("2 messages • relative:2026-05-27T11:00:00.000Z");
    expect(markup).not.toContain("Search conversations");
  });
});
