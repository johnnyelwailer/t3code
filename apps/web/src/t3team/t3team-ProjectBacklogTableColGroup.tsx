import type { ProjectBacklogTableColumnId } from "~/t3team/t3team-projectBacklogTable";
import { projectBacklogTableColumnWidthById } from "~/t3team/t3team-projectBacklogTableViewMeta";

export function ProjectBacklogTableColGroup({
  visibleColumns,
}: {
  visibleColumns: readonly ProjectBacklogTableColumnId[];
}) {
  return (
    <colgroup>
      <col style={{ width: `${projectBacklogTableColumnWidthById.issue}px` }} />
      {visibleColumns.map((columnId) => (
        <col
          key={columnId}
          style={{ width: `${projectBacklogTableColumnWidthById[columnId]}px` }}
        />
      ))}
      <col style={{ width: `${projectBacklogTableColumnWidthById.actions}px` }} />
    </colgroup>
  );
}
