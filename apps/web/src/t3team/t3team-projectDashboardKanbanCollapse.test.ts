import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  buildKanbanGridTemplateColumns,
  withoutCollapsedColumnItems,
} from "./t3team-projectDashboardKanbanCollapse";

const columns = [
  { id: "todo", title: "To do", items: [createTicket({ id: "a" })] },
  { id: "done", title: "Done", items: [createTicket({ id: "b" }), createTicket({ id: "c" })] },
];

describe("kanban column collapse layout", () => {
  it("gives every open column a share of the width and a collapsed one a narrow strip", () => {
    expect(buildKanbanGridTemplateColumns(columns, undefined)).toBe(
      "minmax(17rem, 1fr) minmax(17rem, 1fr)",
    );
    expect(buildKanbanGridTemplateColumns(columns, new Set(["todo"]))).toBe(
      "2.75rem minmax(17rem, 1fr)",
    );
  });

  it("keeps a collapsed column in place but takes its cards out of the layout", () => {
    const laidOut = withoutCollapsedColumnItems(columns, new Set(["done"]));
    expect(laidOut.map((column) => [column.id, column.items.length])).toEqual([
      ["todo", 1],
      ["done", 0],
    ]);
    // The source columns (and so the strip's count) are not mutated.
    expect(columns[1]?.items).toHaveLength(2);
    expect(withoutCollapsedColumnItems(columns, new Set())).toBe(columns);
  });
});
