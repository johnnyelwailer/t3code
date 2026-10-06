// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { ProjectDashboardKanban } from "./t3team-ProjectDashboardKanban";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";

const todo = createTicket({ id: "t1", ref: { title: "Write the spec" }, status: "To Do" });
const done = createTicket({ id: "d1", ref: { title: "Ship the release" }, status: "Done" });
const columns = [
  { id: "todo", title: "To do", items: [todo] },
  { id: "done", title: "Done", items: [done] },
];

let root: Root | null = null;
let container: HTMLDivElement;

async function renderBoard(
  collapsedIds: ReadonlySet<string>,
  onToggle: (id: string, collapsed: boolean) => void,
  isHierarchyMode: boolean,
) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ProjectDashboardKanban
        kanbanColumns={columns}
        allTickets={[todo, done]}
        isHierarchyMode={isHierarchyMode}
        parentChildGroups={buildProjectTicketHierarchy([todo, done])}
        projectId="p1"
        onOpenTicket={() => {}}
        onTicketContextMenu={() => {}}
        columnCollapse={{ collapsedIds, onToggle }}
      />,
    );
  });
}

const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe.each([
  ["flat lanes", false],
  ["parent/child matrix", true],
])("board column collapse (%s)", (_name, isHierarchyMode) => {
  it("collapses a column from its header", async () => {
    const onToggle = vi.fn();
    await renderBoard(new Set(), onToggle, isHierarchyMode);
    expect(container.textContent).toContain("Write the spec");

    await act(async () => button("Collapse Done column")?.click());
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("done", true);
  });

  it("shows a collapsed column as a strip with its name and count, without its cards", async () => {
    const onToggle = vi.fn();
    await renderBoard(new Set(["done"]), onToggle, isHierarchyMode);

    const strip = button("Expand Done column");
    expect(strip?.textContent).toContain("Done");
    expect(strip?.textContent).toContain("1");
    expect(container.textContent).not.toContain("Ship the release");
    // The open column is untouched.
    expect(container.textContent).toContain("Write the spec");

    await act(async () => strip?.click());
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("done", false);
  });
});

describe("a board without collapse state", () => {
  it("offers no collapse control (the all-projects roll-up keeps its plain lanes)", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <ProjectDashboardKanban
          kanbanColumns={columns}
          isHierarchyMode={false}
          parentChildGroups={buildProjectTicketHierarchy([todo, done])}
          projectId="p1"
          onOpenTicket={() => {}}
          onTicketContextMenu={() => {}}
        />,
      );
    });
    expect(button("Collapse Done column")).toBeNull();
    expect(container.textContent).toContain("Ship the release");
  });
});
