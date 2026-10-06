import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

/** Which status lanes the board shows (board lens only). */
export function ProjectMyWorkOptionsMenuLanesSub({
  hiddenKanbanColumnIds,
  onKanbanLaneVisibilityChange,
  kanbanLaneOptions,
}: Pick<
  ProjectMyWorkOptionsMenuProps,
  "hiddenKanbanColumnIds" | "onKanbanLaneVisibilityChange" | "kanbanLaneOptions"
>) {
  return (
    <MenuSub>
      <MenuSubTrigger>Status lanes</MenuSubTrigger>
      <MenuSubPopup className="min-w-60">
        <MenuGroup>
          <MenuGroupLabel>Visible lanes</MenuGroupLabel>
          {kanbanLaneOptions.length > 0 ? (
            kanbanLaneOptions.map((option) => (
              <MenuCheckboxItem
                key={option.id}
                checked={!hiddenKanbanColumnIds.includes(option.id)}
                onCheckedChange={(checked) =>
                  onKanbanLaneVisibilityChange(option.id, Boolean(checked))
                }
              >
                <span className="flex w-full items-center gap-2">
                  <span>{option.title}</span>
                  <span className="ml-auto text-2xs text-muted-foreground">{option.count}</span>
                </span>
              </MenuCheckboxItem>
            ))
          ) : (
            <MenuItem disabled>No lanes available</MenuItem>
          )}
        </MenuGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}
