import { memo, useMemo } from "react";

import type { ProjectBacklogTableGroup } from "~/t3team/t3team-projectBacklogTable";
import { ChevronDown, ChevronRight } from "lucide-react";

export const ProjectBacklogTableGroupHeaderRow = memo(function ProjectBacklogTableGroupHeaderRow({
  group,
  collapsed,
  columnCount,
  onToggleGroup,
}: {
  group: ProjectBacklogTableGroup;
  collapsed: boolean;
  columnCount: number;
  onToggleGroup: (groupId: string) => void;
}) {
  const groupSecondaryText = useMemo(
    () =>
      group.contextCount > 0
        ? `${group.description ? `${group.description} | ` : ""}${group.contextCount} context parent${group.contextCount === 1 ? "" : "s"}`
        : group.description,
    [group.contextCount, group.description],
  );

  return (
    <tr className="bg-muted/15">
      <td colSpan={columnCount} className="px-3 py-1.5 pr-4 sm:pr-5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={() => onToggleGroup(group.id)}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-foreground">
                {group.label}
              </span>
              {groupSecondaryText ? (
                <span className="block truncate text-[10px] text-muted-foreground">
                  {groupSecondaryText}
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            {group.matchedCount} matched
          </span>
        </button>
      </td>
    </tr>
  );
});
