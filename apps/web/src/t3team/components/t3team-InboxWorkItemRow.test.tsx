// @vitest-environment jsdom
/**
 * The regression this file exists for: in the Work lens a work-item row was a bare navigate
 * button. Pinning was therefore ONE-WAY — an item could be pinned from Backlog/My work, but the
 * sidebar it landed in offered no unpin, no hide, no reorder and no drag into a chat, all of which
 * the Code-lens row (`t3team-ProjectSidebarPinnedTicketRows`) has always had. A distribution
 * shipping `sidebarLens: "work"` — the Nexplore pack — got the lesser row silently.
 *
 * `t3team-ProjectSidebarTicketEntry.browser.tsx` asserts exactly this for the Code lens, but no
 * test project matches `*.browser.tsx`, so it has never run. These tests deliberately live in the
 * suite that DOES run, and drive the real `useTicketAgentContext` down to the context-menu call
 * rather than mocking it — the defect was that nothing reached that code, so stubbing it out would
 * assert nothing.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { InboxWorkItemRow as InboxWorkItemRowData } from "~/t3team/t3team-inboxWorkItems";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import { buildTicketSidebarPinnedItem } from "~/t3team/t3team-sidebarPinningTypes";

type ContextMenuEntry = { id: string; label: string };
const contextMenuShow = vi.fn(
  async (_actions: ReadonlyArray<ContextMenuEntry>, _at: { x: number; y: number }) => null,
);

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));
vi.mock("~/localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: contextMenuShow } }),
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => ({ state: { connectionStatus: "connected" } }),
}));
vi.mock("~/t3team/hooks/t3team-useAddToChat", () => ({
  useAddToChat: () => ({ addToChatFromRequest: vi.fn(async () => undefined) }),
}));

const { InboxWorkItemRow } = await import("./t3team-InboxWorkItemRow");

const project = {
  id: "project-1",
  title: "Alpha",
  source: { provider: "atlassian", accountId: "acct-1" },
  workspace: { rootPath: "/workspace/alpha" },
} as unknown as ProjectShellProject;
const ticket = {
  id: "ticket-1",
  projectId: "project-1",
  status: "In Progress",
  issueType: "Story",
  ref: { provider: "atlassian", kind: "issue", id: "ticket-1", displayId: "PROJ-9", title: "Prep" },
} as unknown as ProjectTicket;

const row: InboxWorkItemRowData = {
  ticketId: "ticket-1",
  projectId: "project-1",
  displayId: "PROJ-9",
  title: "Prep",
  url: null,
  reason: "pinned",
  lastActivityAt: "2026-07-01T00:00:00.000Z",
  pullRequestCount: 0,
};

async function mount(projectTickets: ReadonlyArray<ProjectTicket>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ul>
        <InboxWorkItemRow
          row={row}
          project={project}
          projectTickets={projectTickets}
          scopeItemIds={[]}
        />
      </ul>,
    );
  });
  return { host, root };
}

beforeEach(() => {
  contextMenuShow.mockClear();
  document.body.innerHTML = "";
  // The row exists BECAUSE the item is pinned, so the store must say so — that is what makes the
  // menu offer Unpin rather than Pin, and it is the state a real Work-lens user is always in.
  useT3TeamPinnedSidebarStore.setState({
    hydrated: true,
    items: [buildTicketSidebarPinnedItem({ projectId: "project-1", ticketId: "ticket-1" })],
  });
});

describe("InboxWorkItemRow", () => {
  it("reaches the agent-context menu, and that menu can unpin", async () => {
    const { host, root } = await mount([ticket]);
    const actions = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Issue actions for PROJ-9"]',
    );
    expect(actions).toBeTruthy();

    await act(async () => {
      actions!.click();
    });

    expect(contextMenuShow).toHaveBeenCalledTimes(1);
    expect(contextMenuShow.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "add-to-chat", label: "Add to chat" }),
        expect.objectContaining({ id: "unpin", label: "Unpin" }),
      ]),
    );
    await act(async () => root.unmount());
  });

  it("is draggable, so a work item can still be dragged into a chat", async () => {
    const { host, root } = await mount([ticket]);
    expect(host.querySelector('[draggable="true"]')).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("stays inert rather than offering actions when the work item no longer resolves", async () => {
    const { host, root } = await mount([]);
    expect(host.textContent).toContain("PROJ-9");
    expect(host.querySelector('button[aria-label^="Issue actions"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
