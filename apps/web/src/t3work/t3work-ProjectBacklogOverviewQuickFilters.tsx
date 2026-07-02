import type { AtlassianBacklogQuickFilter } from "~/t3work/backend/t3work-atlassianBackendTypes";

export function ProjectBacklogOverviewQuickFilters({
  quickFilters,
  selectedQuickFilterIds,
  onSelectedQuickFilterIdsChange,
}: {
  quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
  selectedQuickFilterIds: ReadonlyArray<string>;
  onSelectedQuickFilterIdsChange: (value: ReadonlyArray<string>) => void;
}) {
  if (quickFilters.length === 0) {
    return null;
  }

  const selectedSet = new Set(selectedQuickFilterIds);

  return (
    <div
      className="flex w-full flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Board quick filters"
    >
      {quickFilters.map((quickFilter) => {
        const isActive = selectedSet.has(quickFilter.id);
        return (
          <button
            key={quickFilter.id}
            type="button"
            aria-pressed={isActive}
            onClick={() =>
              onSelectedQuickFilterIdsChange(
                isActive
                  ? selectedQuickFilterIds.filter((id) => id !== quickFilter.id)
                  : [...selectedQuickFilterIds, quickFilter.id],
              )
            }
            className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
              isActive
                ? "border-accent-foreground/20 bg-accent text-foreground"
                : "border-border/70 bg-background/90 text-muted-foreground hover:text-foreground"
            }`}
          >
            {quickFilter.name}
          </button>
        );
      })}
    </div>
  );
}
