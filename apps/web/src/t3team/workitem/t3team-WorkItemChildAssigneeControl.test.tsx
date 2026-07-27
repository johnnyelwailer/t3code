// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  childAssigneeValue,
  WorkItemChildAssigneeControl,
} from "./t3team-WorkItemChildAssigneeControl";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function child(overrides: Partial<ProjectTicket> = {}): ProjectTicket {
  return {
    id: "internal-42",
    projectId: "project-1",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: "internal-42",
      displayId: "T3T-42",
      title: "Restore camera from the session snapshot",
      url: "https://example.test/browse/T3T-42",
      projectId: "EXT-1",
      type: "Task",
    },
    issueType: "Task",
    status: "To Do",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function render(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(node));
  return container;
}

afterEach(async () => {
  while (mounted.length > 0) {
    const current = mounted.pop()!;
    await act(async () => current.root.unmount());
    current.container.remove();
  }
  document.body.innerHTML = "";
});

describe("childAssigneeValue", () => {
  it("is null for an unassigned child", () => {
    expect(childAssigneeValue(child())).toBeNull();
  });

  it("reads the display name and account id off an assigned child", () => {
    expect(
      childAssigneeValue(child({ assignee: "Ada Lovelace", assigneeAccountId: "acc-ada" })),
    ).toEqual({ displayName: "Ada Lovelace", accountId: "acc-ada" });
  });
});

describe("WorkItemChildAssigneeControl", () => {
  it("assigns through backend.updateIssueAssignee, scoped to the CHILD's own key, and reloads", async () => {
    const updateIssueAssignee = vi.fn().mockResolvedValue(undefined);
    const onReload = vi.fn();
    const backend: Pick<AtlassianBackendApi, "searchAssignableUsers" | "updateIssueAssignee"> = {
      searchAssignableUsers: vi.fn().mockResolvedValue([
        { accountId: "acc-alan", displayName: "Alan Turing", emailAddress: "alan@example.test" },
      ]),
      updateIssueAssignee,
    };

    const container = await render(
      <WorkItemChildAssigneeControl
        child={child()}
        backend={backend as AtlassianBackendApi}
        accountId="acc-current"
        onReload={onReload}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-slot='popover-trigger']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const option = document.body.querySelector<HTMLButtonElement>("[role='option']");
    expect(option?.textContent).toContain("Alan Turing");

    await act(async () => {
      option!.click();
      await Promise.resolve();
    });

    expect(backend.searchAssignableUsers).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-current", issueIdOrKey: "T3T-42" }),
    );
    expect(updateIssueAssignee).toHaveBeenCalledWith({
      accountId: "acc-current",
      issueIdOrKey: "T3T-42",
      assigneeAccountId: "acc-alan",
      assigneeDisplayName: "Alan Turing",
    });
    expect(onReload).toHaveBeenCalled();
  });

  it("rolls back to the previous assignee locally when the backend call fails", async () => {
    const onReload = vi.fn();
    const backend: Pick<AtlassianBackendApi, "searchAssignableUsers" | "updateIssueAssignee"> = {
      searchAssignableUsers: vi.fn().mockResolvedValue([
        { accountId: "acc-alan", displayName: "Alan Turing", emailAddress: "alan@example.test" },
      ]),
      updateIssueAssignee: vi.fn().mockRejectedValue(new Error("Request failed with 500")),
    };

    const container = await render(
      <WorkItemChildAssigneeControl
        child={child({ assignee: "Ada Lovelace", assigneeAccountId: "acc-ada" })}
        backend={backend as AtlassianBackendApi}
        accountId="acc-current"
        onReload={onReload}
      />,
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-slot='popover-trigger']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const option = document.body.querySelector<HTMLButtonElement>("[role='option']");
    await act(async () => {
      option!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The optimistic apply is rolled back and the failure surfaces inline; the parent is never
    // told to reload a change that didn't actually happen.
    expect(container.textContent).toContain("Ada Lovelace");
    expect(onReload).not.toHaveBeenCalled();
  });
});
