import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { ProjectDashboardKanban } from "./t3team-ProjectDashboardKanban";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";

const todo = createTicket({ id: "t1", ref: { title: "Write the spec" }, status: "To Do" });
const done = createTicket({ id: "d1", ref: { title: "Ship the release" }, status: "Done" });
const columns = [
  { id: "todo", title: "To do", items: [todo] },
  { id: "done", title: "Done", items: [done] },
];

function board(
  collapsedIds: ReadonlySet<string> | undefined,
  onToggle: ((id: string, collapsed: boolean) => void) | undefined,
  isHierarchyMode: boolean,
) {
  return (
    <ProjectDashboardKanban
      kanbanColumns={columns}
      {...(collapsedIds ? { allTickets: [todo, done] } : {})}
      isHierarchyMode={isHierarchyMode}
      parentChildGroups={buildProjectTicketHierarchy([todo, done])}
      projectId="p1"
      onOpenTicket={() => {}}
      onTicketContextMenu={() => {}}
      {...(collapsedIds && onToggle ? { columnCollapse: { collapsedIds, onToggle } } : {})}
    />
  );
}

const button = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe.each([
  ["flat lanes", false],
  ["parent/child matrix", true],
])("board column collapse (%s)", (_name, isHierarchyMode) => {
  it("collapses a column from its header", async () => {
    const onToggle = vi.fn();
    await using screen = await render(board(new Set(), onToggle, isHierarchyMode), {
      router: false,
    });
    expect(screen.container.textContent).toContain("Write the spec");

    await act(async () => button(screen.container, "Collapse Done column")?.click());
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("done", true);
  });

  it("shows a collapsed column as a strip with its name and count, without its cards", async () => {
    const onToggle = vi.fn();
    await using screen = await render(board(new Set(["done"]), onToggle, isHierarchyMode), {
      router: false,
    });

    const strip = button(screen.container, "Expand Done column");
    expect(strip?.textContent).toContain("Done");
    expect(strip?.textContent).toContain("1");
    expect(screen.container.textContent).not.toContain("Ship the release");
    expect(screen.container.textContent).toContain("Write the spec");

    await act(async () => strip?.click());
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("done", false);
  });
});

describe("a board without collapse state", () => {
  it("offers no collapse control (the all-projects roll-up keeps its plain lanes)", async () => {
    await using screen = await render(board(undefined, undefined, false), { router: false });
    expect(button(screen.container, "Collapse Done column")).toBeNull();
    expect(screen.container.textContent).toContain("Ship the release");
  });
});
