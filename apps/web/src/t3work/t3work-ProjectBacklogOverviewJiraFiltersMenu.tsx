import { ChevronDownIcon, FilterIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import type { AtlassianBacklogSavedFilter } from "~/t3work/backend/t3work-types";
import type { AtlassianBacklogQuickFilter } from "~/t3work/backend/t3work-atlassianBackendTypes";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "~/t3work/components/ui/t3work-menu";
import { projectBacklogFocusFilterOptions } from "~/t3work/t3work-ProjectBacklogOptionsMenuMeta";
import type { ProjectBacklogFocusFilter } from "~/t3work/t3work-projectBacklogUtils";

const ALL_SAVED_FILTERS_VALUE = "__all_saved_filters__";
const DEFAULT_FOCUS_FILTER: ProjectBacklogFocusFilter = "all";

export function ProjectBacklogOverviewJiraFiltersMenu({
  quickFilters,
  selectedQuickFilterIds,
  onSelectedQuickFilterIdsChange,
  savedFilters,
  selectedFilterId,
  onFilterChange,
  focusFilter,
  onFocusFilterChange,
}: {
  quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
  selectedQuickFilterIds: ReadonlyArray<string>;
  onSelectedQuickFilterIdsChange: (value: ReadonlyArray<string>) => void;
  savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  selectedFilterId: string | undefined;
  onFilterChange: (filterId: string | undefined) => void;
  focusFilter: ProjectBacklogFocusFilter;
  onFocusFilterChange: (value: ProjectBacklogFocusFilter) => void;
}) {
  const selectedQuickFilterSet = new Set(selectedQuickFilterIds);
  const activeCount =
    selectedQuickFilterSet.size +
    (selectedFilterId ? 1 : 0) +
    (focusFilter !== DEFAULT_FOCUS_FILTER ? 1 : 0);
  const triggerLabel = activeCount === 0 ? "Filters" : `Filters (${activeCount})`;

  function toggleQuickFilter(quickFilterId: string, checked: boolean) {
    onSelectedQuickFilterIdsChange(
      checked
        ? [...selectedQuickFilterIds, quickFilterId]
        : selectedQuickFilterIds.filter((id) => id !== quickFilterId),
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" size="xs" />}
        className="w-auto justify-between gap-1.5 font-normal data-[popup-open]:bg-accent"
        aria-label="Filter backlog by Jira filters"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <FilterIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" className="min-w-[15rem] border-border/80">
        <MenuGroup>
          <MenuGroupLabel>Focus</MenuGroupLabel>
          <MenuRadioGroup
            className="grid gap-1"
            value={focusFilter}
            onValueChange={(value) => onFocusFilterChange(value as ProjectBacklogFocusFilter)}
          >
            {projectBacklogFocusFilterOptions.map((option) => (
              <MenuRadioItem
                key={option.value}
                value={option.value}
                className="min-h-8 rounded-md py-1.5 text-[12px]"
              >
                {option.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>

        {quickFilters.length > 0 || savedFilters.length > 0 ? <MenuSeparator /> : null}

        {quickFilters.length > 0 ? (
          <MenuGroup>
            <MenuGroupLabel>Quick filters</MenuGroupLabel>
            {quickFilters.map((quickFilter) => (
              <MenuCheckboxItem
                key={quickFilter.id}
                checked={selectedQuickFilterSet.has(quickFilter.id)}
                className="min-h-8 rounded-md py-1.5 text-[12px]"
                onCheckedChange={(checked) => toggleQuickFilter(quickFilter.id, Boolean(checked))}
              >
                {quickFilter.name}
              </MenuCheckboxItem>
            ))}
          </MenuGroup>
        ) : null}

        {quickFilters.length > 0 && savedFilters.length > 0 ? <MenuSeparator /> : null}

        {savedFilters.length > 0 ? (
          <MenuGroup>
            <MenuGroupLabel>Saved filters</MenuGroupLabel>
            <MenuRadioGroup
              className="grid max-h-72 gap-1 overflow-y-auto"
              value={selectedFilterId ?? ALL_SAVED_FILTERS_VALUE}
              onValueChange={(value) =>
                onFilterChange(value === ALL_SAVED_FILTERS_VALUE ? undefined : (value as string))
              }
            >
              <MenuRadioItem
                value={ALL_SAVED_FILTERS_VALUE}
                className="min-h-8 rounded-md py-1.5 text-[12px]"
              >
                All issues
              </MenuRadioItem>
              {savedFilters.map((savedFilter) => (
                <MenuRadioItem
                  key={savedFilter.id}
                  value={savedFilter.id}
                  className="min-h-8 rounded-md py-1.5 text-[12px]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{savedFilter.name}</span>
                    <MenuShortcut className="max-w-[15rem] truncate text-left font-normal tracking-normal text-muted-foreground/80">
                      {savedFilter.jql}
                    </MenuShortcut>
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
