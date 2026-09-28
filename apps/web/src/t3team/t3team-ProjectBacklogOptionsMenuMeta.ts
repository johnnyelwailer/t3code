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

/**
 * The current value a sub-menu trigger shows at its end. A plain span, as upstream's
 * PullRequestListFilters does it — MenuShortcut is for key hints and owns that look.
 */
export const menuValueClassName =
  "ms-auto min-w-0 max-w-36 truncate text-right text-xs text-muted-foreground/80";

export function getSelectedBacklogOptionLabel<TValue extends string>(
  options: ReadonlyArray<{ value: TValue; label: string }>,
  value: TValue,
): string | undefined {
  return options.find((option) => option.value === value)?.label;
}
