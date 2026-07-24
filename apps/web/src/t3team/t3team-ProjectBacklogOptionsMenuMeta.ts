import type { ProjectBacklogFocusFilter } from "~/t3team/t3team-projectBacklogUtils";

export const projectBacklogFocusFilterOptions: ReadonlyArray<{
  value: ProjectBacklogFocusFilter;
  label: string;
}> = [
  { value: "all", label: "All issues" },
  { value: "needs-plan", label: "Needs plan" },
  { value: "unassigned", label: "Unassigned" },
  { value: "with-subtasks", label: "With subtasks" },
];

export const twoColumnRadioGroupClassName = "grid gap-0.5 sm:grid-cols-2";
export const singleColumnRadioGroupClassName = "grid gap-1";
export const stackedRadioGroupClassName = "grid max-h-72 gap-1 overflow-y-auto";
export const radioItemClassName = "min-h-8 rounded-md py-1.5 text-[12px]";
export const menuShortcutClassName =
  "max-w-[9rem] truncate text-right font-normal tracking-normal text-muted-foreground/80";
export const menuSubPopupClassName = "min-w-[15rem] border-border/80";

export function getSelectedBacklogOptionLabel<TValue extends string>(
  options: ReadonlyArray<{ value: TValue; label: string }>,
  value: TValue,
): string | undefined {
  return options.find((option) => option.value === value)?.label;
}
