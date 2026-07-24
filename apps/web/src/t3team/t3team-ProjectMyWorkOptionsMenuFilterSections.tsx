import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

export function ProjectMyWorkOptionsMenuFilterSections({
  excludedTypeKeys,
  onTypeVisibilityChange,
  typeOptions,
  selectedPriority,
  onSelectedPriorityChange,
  priorityOptions,
  selectedStatus,
  onSelectedStatusChange,
  statusOptions,
  onReset,
}: Pick<
  ProjectMyWorkOptionsMenuProps,
  | "excludedTypeKeys"
  | "onTypeVisibilityChange"
  | "typeOptions"
  | "selectedPriority"
  | "onSelectedPriorityChange"
  | "priorityOptions"
  | "selectedStatus"
  | "onSelectedStatusChange"
  | "statusOptions"
  | "onReset"
>) {
  return (
    <>
      <MenuSub>
        <MenuSubTrigger>Issue types</MenuSubTrigger>
        <MenuSubPopup className="min-w-[15rem] border-border/80 bg-background/95">
          <MenuGroup>
            <MenuGroupLabel>Visible issue types</MenuGroupLabel>
            {typeOptions.length > 0 ? (
              typeOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.key}
                  checked={!excludedTypeKeys.includes(option.key)}
                  onCheckedChange={(checked) =>
                    onTypeVisibilityChange(option.key, Boolean(checked))
                  }
                >
                  {option.label}
                </MenuCheckboxItem>
              ))
            ) : (
              <MenuItem disabled>No issue types available</MenuItem>
            )}
          </MenuGroup>
        </MenuSubPopup>
      </MenuSub>

      <MenuSub>
        <MenuSubTrigger>Priority</MenuSubTrigger>
        <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
          <MenuRadioGroup value={selectedPriority} onValueChange={onSelectedPriorityChange}>
            <MenuRadioItem value="all">All priorities</MenuRadioItem>
            {priorityOptions.map((priority) => (
              <MenuRadioItem key={priority} value={priority}>
                {priority}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubPopup>
      </MenuSub>

      <MenuSub>
        <MenuSubTrigger>Exact status</MenuSubTrigger>
        <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
          <MenuRadioGroup value={selectedStatus} onValueChange={onSelectedStatusChange}>
            <MenuRadioItem value="all">All statuses</MenuRadioItem>
            {statusOptions.map((status) => (
              <MenuRadioItem key={status} value={status}>
                {status}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSubPopup>
      </MenuSub>

      <MenuSeparator />

      <MenuGroup>
        <MenuItem className="min-h-8 rounded-md py-1.5 text-[12px]" onClick={onReset}>
          Reset filters
        </MenuItem>
      </MenuGroup>
    </>
  );
}
