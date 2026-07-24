import { memo, useCallback } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import {
  getProjectBacklogTableColumnHeaderLabel,
  getProjectBacklogTableColumnSortBy,
  resolveProjectBacklogTableVisibleColumns,
} from "~/t3team/t3team-projectBacklogTableViewMeta";

export const ProjectBacklogTableHeader = memo(function ProjectBacklogTableHeader({
  visibleColumns,
  sortBy,
  sortDirection,
  estimateFieldLabel,
  onSortByChange,
  onSortDirectionChange,
}: {
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  sortBy: ProjectBacklogTableSortBy;
  sortDirection: ProjectBacklogTableSortDirection;
  estimateFieldLabel?: string;
  onSortByChange: (value: ProjectBacklogTableSortBy) => void;
  onSortDirectionChange: (value: ProjectBacklogTableSortDirection) => void;
}) {
  const visibleTableColumns = resolveProjectBacklogTableVisibleColumns(visibleColumns);

  const handleSortChange = useCallback(
    (nextSortBy: ProjectBacklogTableSortBy) => {
      if (sortBy === nextSortBy) {
        onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc");
        return;
      }
      onSortByChange(nextSortBy);
    },
    [onSortByChange, onSortDirectionChange, sortBy, sortDirection],
  );

  function renderSortButton(label: string, column: ProjectBacklogTableSortBy) {
    const active = sortBy === column;
    return (
      <button
        type="button"
        className="inline-flex w-full items-center gap-1 font-semibold hover:text-foreground"
        onClick={() => handleSortChange(column)}
      >
        <span>{label}</span>
        {active ? (
          sortDirection === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    );
  }

  function renderColumnHeader(columnId: ProjectBacklogTableColumnId) {
    const label = getProjectBacklogTableColumnHeaderLabel(columnId, estimateFieldLabel);
    const sortableColumn = getProjectBacklogTableColumnSortBy(columnId);
    return sortableColumn ? (
      renderSortButton(label, sortableColumn)
    ) : (
      <span className="font-semibold text-foreground/80">{label}</span>
    );
  }

  return (
    <thead className="sticky top-0 z-10 border-b border-border/60 bg-background/95 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/72 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <tr>
        <th className="px-3 py-1.5">{renderSortButton("Issue", "title")}</th>
        {visibleTableColumns.map((column) => (
          <th key={column.value} className="px-3 py-1.5">
            {renderColumnHeader(column.value)}
          </th>
        ))}
        <th className="sticky right-3 z-20 w-px whitespace-nowrap border-l border-border/60 bg-background/95 px-1.5 py-1.5 text-right">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
});
