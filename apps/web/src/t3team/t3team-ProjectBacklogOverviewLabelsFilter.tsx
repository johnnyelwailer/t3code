import { CheckIcon, ChevronDownIcon, TagIcon } from "lucide-react";

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
import type { ProjectBacklogLabelFilterOption } from "~/t3team/t3team-projectBacklogUtils";

export function ProjectBacklogOverviewLabelsFilter({
  value,
  onValueChange,
  options,
}: {
  value: ReadonlyArray<string>;
  onValueChange: (value: ReadonlyArray<string>) => void;
  options: ReadonlyArray<ProjectBacklogLabelFilterOption>;
}) {
  if (options.length === 0) {
    return null;
  }

  const selectedSet = new Set(value);
  const triggerLabel = selectedSet.size === 0 ? "Labels" : `Labels (${selectedSet.size})`;
  const statusText = `${options.length} label option${options.length === 1 ? "" : "s"}`;

  return (
    <Combobox
      items={options.map((option) => option.value)}
      multiple
      value={[...value]}
      onValueChange={(nextValue) => {
        if (Array.isArray(nextValue)) {
          onValueChange(nextValue as ReadonlyArray<string>);
        }
      }}
    >
      <ComboboxTrigger
        render={<Button variant="outline" size="xs" />}
        className="w-[10rem] justify-between gap-1.5 font-normal"
        aria-label="Filter backlog by labels"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </ComboboxTrigger>
      <ComboboxPopup align="start" side="bottom" className="w-[15rem]">
        <div className="border-b p-1">
          <ComboboxInput
            className="[&_input]:font-sans rounded-md"
            inputClassName="ring-0"
            placeholder="Search labels..."
            showTrigger={false}
            size="sm"
          />
        </div>
        <ComboboxEmpty>No matching labels.</ComboboxEmpty>
        <ComboboxList className="max-h-56">
          {options.map((option) => (
            <ComboboxItem
              key={option.value}
              value={option.value}
              className="text-xs"
              contentClassName="flex min-w-0 items-center gap-2"
              hideIndicator
            >
              <span className="truncate">{option.value}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{option.count}</span>
              {selectedSet.has(option.value) ? <CheckIcon className="size-3.5" /> : null}
            </ComboboxItem>
          ))}
        </ComboboxList>
        <ComboboxStatus>{statusText}</ComboboxStatus>
      </ComboboxPopup>
    </Combobox>
  );
}
