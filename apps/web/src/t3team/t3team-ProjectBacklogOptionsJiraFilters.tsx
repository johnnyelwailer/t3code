import type { AtlassianBacklogBoard, AtlassianBacklogSprint } from "~/t3team/backend/t3team-types";
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { menuValueClassName } from "~/t3team/t3team-ProjectBacklogOptionsMenuMeta";

const ALL_SPRINTS_VALUE = "all";

export function ProjectBacklogOptionsJiraFilters({
  boards,
  sprints,
  selectedBoardId,
  selectedSprintId,
  onBoardChange,
  onSprintChange,
}: {
  boards: ReadonlyArray<AtlassianBacklogBoard>;
  sprints: ReadonlyArray<AtlassianBacklogSprint>;
  selectedBoardId: string | undefined;
  selectedSprintId: string | undefined;
  onBoardChange: (boardId: string) => void;
  onSprintChange: (sprintId: string | undefined) => void;
}) {
  const hasBoards = boards.length > 0;
  const hasSprintOptions = hasBoards || sprints.length > 0;
  const selectedBoardValue =
    hasBoards && boards.some((board) => board.id === selectedBoardId)
      ? selectedBoardId
      : boards[0]?.id;
  const selectedBoardLabel =
    boards.find((board) => board.id === selectedBoardValue)?.name ?? "No sprint boards";
  const selectedSprintLabel = hasSprintOptions
    ? (sprints.find((sprint) => sprint.id === selectedSprintId)?.name ?? "All board issues")
    : "No sprints";

  return (
    <>
      <MenuSub>
        <MenuSubTrigger>
          Sprint board
          <span className={menuValueClassName}>{selectedBoardLabel}</span>
        </MenuSubTrigger>
        <MenuSubPopup className="min-w-60">
          {hasBoards ? (
            <MenuRadioGroup
              className="max-h-72 overflow-y-auto"
              value={selectedBoardValue ?? ""}
              onValueChange={(value) => onBoardChange(value)}
            >
              {boards.map((board) => (
                <MenuRadioItem key={board.id} value={board.id}>
                  {board.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          ) : (
            <MenuItem disabled>
              Jira did not return any sprint boards for this project yet.
            </MenuItem>
          )}
        </MenuSubPopup>
      </MenuSub>

      <MenuSub>
        <MenuSubTrigger>
          Sprint
          <span className={menuValueClassName}>{selectedSprintLabel}</span>
        </MenuSubTrigger>
        <MenuSubPopup className="min-w-60">
          {hasSprintOptions ? (
            <MenuRadioGroup
              className="max-h-72 overflow-y-auto"
              value={selectedSprintId ?? ALL_SPRINTS_VALUE}
              onValueChange={(value) =>
                onSprintChange(value === ALL_SPRINTS_VALUE ? undefined : value)
              }
            >
              <MenuRadioItem value={ALL_SPRINTS_VALUE}>All board issues</MenuRadioItem>
              {sprints.map((sprint) => (
                <MenuRadioItem key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          ) : (
            <MenuItem disabled>Jira did not return any sprints for this project yet.</MenuItem>
          )}
        </MenuSubPopup>
      </MenuSub>
    </>
  );
}
