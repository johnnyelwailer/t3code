import { EllipsisIcon } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3work/components/ui/t3work-popover";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import { ToggleGroup } from "~/t3work/t3work-ToggleGroup";
import { ProjectDashboardItemTypeToggles } from "~/t3work/t3work-ProjectDashboardItemTypeToggles";

export function ProjectDashboardFilterBar({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  groupMode,
  onGroupModeChange,
  statusCategory,
  onStatusCategoryChange,
  showJiraItems,
  onShowJiraItemsChange,
  showGitHubActivity,
  onShowGitHubActivityChange,
  advancedFiltersOpen,
  onAdvancedFiltersOpenChange,
  activeAdvancedFilterCount,
  selectedType,
  onSelectedTypeChange,
  typeOptions,
  selectedPriority,
  onSelectedPriorityChange,
  priorityOptions,
  selectedStatus,
  onSelectedStatusChange,
  statusOptions,
  onReset,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  viewMode: "grid" | "list" | "kanban";
  onViewModeChange: (value: "grid" | "list" | "kanban") => void;
  groupMode: "flat" | "parent-child";
  onGroupModeChange: (value: "flat" | "parent-child") => void;
  statusCategory: "all" | "active" | "review" | "done";
  onStatusCategoryChange: (value: "all" | "active" | "review" | "done") => void;
  showJiraItems: boolean;
  onShowJiraItemsChange: (value: boolean) => void;
  showGitHubActivity: boolean;
  onShowGitHubActivityChange: (value: boolean) => void;
  advancedFiltersOpen: boolean;
  onAdvancedFiltersOpenChange: (open: boolean) => void;
  activeAdvancedFilterCount: number;
  selectedType: string;
  onSelectedTypeChange: (value: string) => void;
  typeOptions: readonly string[];
  selectedPriority: string;
  onSelectedPriorityChange: (value: string) => void;
  priorityOptions: readonly string[];
  selectedStatus: string;
  onSelectedStatusChange: (value: string) => void;
  statusOptions: readonly string[];
  onReset: () => void;
}) {
  return (
    <T3SurfacePanel tone="soft" className="mb-4 space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by key, title, assignee..."
          className="min-w-[18rem] flex-1 border-border/80 bg-background/95"
        />

        <ToggleGroup
          value={viewMode}
          onChange={(value) => onViewModeChange(value as "grid" | "list" | "kanban")}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
            { value: "kanban", label: "Kanban" },
          ]}
        />

        <ToggleGroup
          value={groupMode}
          onChange={(value) => onGroupModeChange(value as "flat" | "parent-child")}
          options={[
            { value: "parent-child", label: "Hierarchy" },
            { value: "flat", label: "Flat" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={statusCategory}
          onChange={(value) =>
            onStatusCategoryChange(value as "all" | "active" | "review" | "done")
          }
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "review", label: "Review" },
            { value: "done", label: "Done" },
          ]}
        />

        <div className="ml-auto">
          <Popover open={advancedFiltersOpen} onOpenChange={onAdvancedFiltersOpenChange}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={`relative text-muted-foreground hover:text-foreground ${
                    advancedFiltersOpen ? "bg-accent text-foreground" : ""
                  }`}
                />
              }
            >
              <EllipsisIcon className="size-4" />
              <span className="sr-only">Advanced filters</span>
              {activeAdvancedFilterCount > 0 ? (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground/75" />
              ) : null}
            </PopoverTrigger>

            <PopoverPopup
              align="end"
              side="bottom"
              sideOffset={6}
              className="w-[min(92vw,36rem)] border-border/80 bg-popover p-0"
            >
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-2">
                  <div className="text-xs font-medium">Advanced filters</div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={onReset}
                  >
                    Reset
                  </button>
                </div>

                <div className="flex flex-wrap gap-3">
                  <ProjectDashboardItemTypeToggles
                    showJiraItems={showJiraItems}
                    onShowJiraItemsChange={onShowJiraItemsChange}
                    showGitHubActivity={showGitHubActivity}
                    onShowGitHubActivityChange={onShowGitHubActivityChange}
                  />

                  <div className="space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </div>
                    <ToggleGroup
                      value={selectedType}
                      onChange={onSelectedTypeChange}
                      options={[
                        { value: "all", label: "All" },
                        ...typeOptions.map((type) => ({ value: type, label: type })),
                      ]}
                      wrap
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Priority
                    </div>
                    <ToggleGroup
                      value={selectedPriority}
                      onChange={onSelectedPriorityChange}
                      options={[
                        { value: "all", label: "All" },
                        ...priorityOptions.map((priority) => ({
                          value: priority,
                          label: priority,
                        })),
                      ]}
                      wrap
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Exact status
                    </div>
                    <ToggleGroup
                      value={selectedStatus}
                      onChange={onSelectedStatusChange}
                      options={[
                        { value: "all", label: "All" },
                        ...statusOptions.map((status) => ({
                          value: status,
                          label: status,
                        })),
                      ]}
                      wrap
                    />
                  </div>
                </div>
              </div>
            </PopoverPopup>
          </Popover>
        </div>
      </div>
    </T3SurfacePanel>
  );
}
