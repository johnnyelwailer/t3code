// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ProjectMyWorkOptionsMenu } from "~/t3team/t3team-ProjectMyWorkOptionsMenu";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

const props = (lens: ProjectMyWorkLens): ProjectMyWorkOptionsMenuProps => ({
  lens,
  activeOptionsCount: 0,
  viewMode: "kanban",
  onViewModeChange: vi.fn(),
  groupMode: "hierarchy",
  onGroupModeChange: vi.fn(),
  statusCategory: "all",
  onStatusCategoryChange: vi.fn(),
  hiddenKanbanColumnIds: [],
  onKanbanLaneVisibilityChange: vi.fn(),
  epicsHidden: false,
  onEpicsHiddenChange: vi.fn(),
  excludedTypeKeys: [],
  onTypeVisibilityChange: vi.fn(),
  typeOptions: [],
  kanbanLaneOptions: [],
  selectedPriority: "all",
  onSelectedPriorityChange: vi.fn(),
  priorityOptions: [],
  selectedStatus: "all",
  onSelectedStatusChange: vi.fn(),
  statusOptions: [],
  tableSortBy: "updated",
  onTableSortByChange: vi.fn(),
  tableSortDirection: "desc",
  onTableSortDirectionChange: vi.fn(),
  onReset: vi.fn(),
});

let root: Root | null = null;
let container: HTMLDivElement;

async function openMenuFor(lens: ProjectMyWorkLens): Promise<string> {
  await act(async () => {
    root = createRoot(container);
    root.render(<ProjectMyWorkOptionsMenu {...props(lens)} />);
  });
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="My work options"]');
  await act(async () => trigger?.click());
  return document.body.querySelector('[data-slot="menu-popup"]')?.textContent ?? "";
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("My work options menu", () => {
  it("shows the digest only what the digest filter applies", async () => {
    const menu = await openMenuFor("digest");
    expect(menu).toContain("Status focus");
    expect(menu).toContain("Hide epics");
    expect(menu).toContain("Issue types");
    expect(menu).toContain("Priority");
    expect(menu).toContain("Exact status");
    for (const hidden of ["Layout", "Grouping", "Sort items", "Sort direction", "Status lanes"]) {
      expect(menu).not.toContain(hidden);
    }
  });

  it("shows the list lens its layout and sort, but no board controls", async () => {
    const menu = await openMenuFor("hierarchy");
    expect(menu).toContain("Layout");
    expect(menu).toContain("Sort items");
    expect(menu).toContain("Status focus");
    for (const hidden of ["Grouping", "Status lanes"]) {
      expect(menu).not.toContain(hidden);
    }
  });

  it("shows the board its grouping, sort and lanes, but no list layout", async () => {
    const menu = await openMenuFor("board");
    expect(menu).toContain("Grouping");
    expect(menu).toContain("Sort items");
    expect(menu).toContain("Status lanes");
    expect(menu).not.toContain("Layout");
  });
});
