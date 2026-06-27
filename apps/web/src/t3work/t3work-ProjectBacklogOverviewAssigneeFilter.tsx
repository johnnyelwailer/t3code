import { CheckIcon, ChevronDownIcon, UserRoundIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxStatus,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import {
  PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL,
  projectBacklogAssigneeFilterScopeOptions,
  type ProjectBacklogAssigneeFilterOption,
  type ProjectBacklogAssigneeFilterScope,
  type ProjectBacklogAssigneeFilterScopeKey,
} from "~/t3work/t3work-projectBacklogUtils";

export function ProjectBacklogOverviewAssigneeFilter({
  value,
  onValueChange,
  scope,
  onScopeChange,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  scope: ProjectBacklogAssigneeFilterScope;
  onScopeChange: (value: ProjectBacklogAssigneeFilterScope) => void;
  options: ReadonlyArray<ProjectBacklogAssigneeFilterOption>;
}) {
  const selectedOption =
    options.find((option) => option.value === value) ??
    options.find((option) => option.value === PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL) ??
    options[0];
  const triggerLabel = selectedOption?.label ?? "All assignees";
  const statusText = `${options.length} assignee option${options.length === 1 ? "" : "s"}`;
  const showScopeOptions = value !== PROJECT_BACKLOG_ASSIGNEE_FILTER_ALL;

  function toggleScope(scopeKey: ProjectBacklogAssigneeFilterScopeKey, checked: boolean): void {
    const enabledCount = projectBacklogAssigneeFilterScopeOptions.filter(
      (option) => scope[option.value],
    ).length;
    if (!checked && enabledCount <= 1) {
      return;
    }

    onScopeChange({
      ...scope,
      [scopeKey]: checked,
    });
  }

  return (
    <Combobox
      items={options.map((option) => option.value)}
      value={value}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string" && nextValue) {
          onValueChange(nextValue);
        }
      }}
    >
      <ComboboxTrigger
        render={<Button variant="outline" size="xs" />}
        className="w-[11rem] justify-between gap-1.5 font-normal"
        aria-label="Filter backlog by assignee"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </ComboboxTrigger>
      <ComboboxPopup align="start" side="bottom" className="w-[15rem]">
        <div className="border-b p-1">
          <ComboboxInput
            className="[&_input]:font-sans rounded-md"
            inputClassName="ring-0"
            placeholder="Search assignees..."
            showTrigger={false}
            size="sm"
          />
        </div>
        <ComboboxEmpty>No matching assignees.</ComboboxEmpty>
        <ComboboxList className="max-h-56">
          {options.map((option) => (
            <ComboboxItem
              key={option.value}
              value={option.value}
              className="text-xs"
              contentClassName="flex min-w-0 items-center gap-2"
            >
              <span className="truncate">{option.label}</span>
              {option.value === value ? <CheckIcon className="ml-auto size-3.5" /> : null}
            </ComboboxItem>
          ))}
        </ComboboxList>
        {showScopeOptions ? (
          <div className="border-t px-2 py-2">
            <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Assignee applies to
            </p>
            <p className="px-1 pb-2 text-[10px] leading-snug text-muted-foreground">
              Stories bubble up from your subtasks. Subtasks filter directly when enabled.
            </p>
            <div className="space-y-1">
              {projectBacklogAssigneeFilterScopeOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-xs hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-border"
                    checked={scope[option.value]}
                    onChange={(event) => toggleScope(option.value, event.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <ComboboxStatus>{statusText}</ComboboxStatus>
      </ComboboxPopup>
    </Combobox>
  );
}
