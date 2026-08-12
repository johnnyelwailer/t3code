// @vitest-environment jsdom
/**
 * The regression this file exists for: `useT3TeamInboxWorkItems` only ever read
 * `kind: "jira-work-item"` pins (t3team-useInboxWorkItems.ts), so a GitHub item pinned via
 * "Pin to left" wrote to the pinned-sidebar store but rendered nothing in the Work-lens Inbox —
 * the Code lens's `PinnedGitHubActivityRow` has no Work-lens equivalent to read it back into.
 * These tests drive the real row down to the rendered link and the agent-context menu, the same
 * way `t3team-InboxWorkItemRow.test.tsx` does for jira pins.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { InboxGitHubActivityPinRow } from "~/t3team/t3team-inboxWorkItems";

type ContextMenuEntry = { id: string; label: string };
const contextMenuShow = vi.fn(
  async (_actions: ReadonlyArray<ContextMenuEntry>, _at: { x: number; y: number }) => null,
);

const boundProject = {
  id: "project-1",
  title: "Alpha",
  source: { provider: "atlassian", accountId: "acct-1" },
  workspace: { rootPath: "/workspace/alpha" },
};

const activityItem = {
  id: "gh-1",
  repository: "nexplore/alpha",
  reason: "assigned",
  subjectType: "PullRequest",
  subjectState: "open",
  subjectTitle: "Ship the pin fix",
  subjectUrl: "https://github.example/nexplore/alpha/pull/9",
};

vi.mock("~/t3team/hooks/t3team-useProjectStore", () => ({
  useProjectStore: () => ({
    allProjects: [boundProject],
    getTicketsForProject: () => [],
  }),
}));
vi.mock("~/t3team/hooks/t3team-useProjectGitHubActivity", () => ({
  useProjectGitHubActivity: () => ({
    activityItems: [activityItem],
    activityByWorkItem: new Map(),
    unlinkedActivityItems: [activityItem],
  }),
}));
vi.mock("~/localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: contextMenuShow } }),
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => ({ state: { connectionStatus: "connected" } }),
}));
vi.mock("~/t3team/hooks/t3team-useAddToChat", () => ({
  useAddToChat: () => ({ addToChatFromRequest: vi.fn(async () => undefined) }),
}));

const { InboxPinnedGitHubActivityRows } = await import("./t3team-InboxPinnedGitHubActivityRows");

const rows: ReadonlyArray<InboxGitHubActivityPinRow> = [
  {
    id: "project-1:github-activity:gh-1",
    projectId: "project-1",
    activityId: "gh-1",
    pinnedAt: "2026-07-01T00:00:00.000Z",
  },
];

async function mount(pinnedRows: ReadonlyArray<InboxGitHubActivityPinRow>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ul>
        <InboxPinnedGitHubActivityRows rows={pinnedRows} />
      </ul>,
    );
  });
  return { host, root };
}

beforeEach(() => {
  contextMenuShow.mockClear();
  document.body.innerHTML = "";
});

describe("InboxPinnedGitHubActivityRows", () => {
  it("renders a pinned GitHub-activity row resolved from the project's live feed", async () => {
    const { host, root } = await mount(rows);
    expect(host.textContent).toContain("Ship the pin fix");
    expect(host.querySelector(`a[href="${activityItem.subjectUrl}"]`)).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("reaches the agent-context menu on right-click, offering unpin", async () => {
    const { host, root } = await mount(rows);
    const link = host.querySelector("a");
    expect(link).toBeTruthy();

    await act(async () => {
      link!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(contextMenuShow).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("stays silent for a pinned activity no longer in the project's feed", async () => {
    const { host, root } = await mount([
      {
        id: "project-1:github-activity:gh-missing",
        projectId: "project-1",
        activityId: "gh-missing",
        pinnedAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    expect(host.querySelector("a")).toBeNull();
    await act(async () => root.unmount());
  });
});
