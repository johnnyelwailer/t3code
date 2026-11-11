import { useState } from "react";

import type { EnvironmentFilterPill } from "@t3tools/client-runtime/t3team-environmentFilter";

import { cn } from "~/lib/utils";

import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import {
  ENVIRONMENT_FILTER_PILL_BASE,
  ENVIRONMENT_FILTER_PILL_UNSELECTED,
} from "./t3team-SidebarEnvironmentFilterPill";

/**
 * The last pill of the environment row: "+N" while environments do not fit, opening the full
 * list so every hidden environment stays one click away — the project discs' +N disc.
 */
export function T3TeamSidebarEnvironmentFilterPicker({
  pills,
  hiddenCount,
  onSelect,
}: {
  pills: ReadonlyArray<EnvironmentFilterPill>;
  hiddenCount: number;
  onSelect: (environmentId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = pills.find((pill) => pill.selected) ?? pills[0]!;
  return (
    <Combobox
      items={pills}
      filteredItems={pills}
      autoHighlight
      itemToStringLabel={(pill) => pill.label}
      isItemEqualToValue={(a, b) => (a.id ?? "all") === (b.id ?? "all")}
      open={open}
      onOpenChange={(next) => setOpen(next)}
      value={selected}
      onValueChange={(pill) => {
        if (!pill) return;
        onSelect(pill.id);
        setOpen(false);
      }}
    >
      <ComboboxTrigger
        render={
          <button
            type="button"
            aria-label={`${hiddenCount} more environment${hiddenCount === 1 ? "" : "s"}`}
            className={cn(ENVIRONMENT_FILTER_PILL_BASE, ENVIRONMENT_FILTER_PILL_UNSELECTED)}
          />
        }
      >
        +{hiddenCount}
      </ComboboxTrigger>
      <ComboboxPopup align="start">
        <ComboboxList>
          {(pill) => (
            <ComboboxItem key={pill.id ?? "all"} value={pill}>
              <span className="min-w-0 flex-1 truncate text-sm">{pill.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
