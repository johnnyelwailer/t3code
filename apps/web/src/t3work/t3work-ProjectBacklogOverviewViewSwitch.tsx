import { Orbit, Table2 } from "lucide-react";

import { planningSpaceEnabled } from "~/t3work/planning-space/t3work-planningSpaceFlag";
import type { ProjectBacklogViewMode } from "~/t3work/t3work-projectBacklogPresentation";

export function ProjectBacklogOverviewViewSwitch({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ProjectBacklogViewMode;
  onViewModeChange: (value: ProjectBacklogViewMode) => void;
}) {
  if (!planningSpaceEnabled) {
    return null;
  }

  return (
    <div
      className="inline-flex items-center rounded-md border border-border/70 bg-background/90"
      role="group"
      aria-label="Quick view switch"
    >
      <button
        type="button"
        aria-label="Table view"
        aria-pressed={viewMode === "table"}
        onClick={() => onViewModeChange("table")}
        className={`inline-flex size-8 items-center justify-center rounded-l-md transition-colors ${
          viewMode === "table"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Table2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Planning space view"
        aria-pressed={viewMode === "planning-space"}
        onClick={() => onViewModeChange("planning-space")}
        className={`inline-flex size-8 items-center justify-center rounded-r-md transition-colors ${
          viewMode === "planning-space"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Orbit className="size-4" />
      </button>
    </div>
  );
}
