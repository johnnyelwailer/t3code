/* oxlint-disable t3code/no-native-title-tooltip -- Quiet +/- has no room for persistent text labels. */
import { ZoomIn, ZoomOut } from "lucide-react";

import { stepKanbanZoomLevel, type KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";

/**
 * Quiet discoverability chrome for kanban semantic zoom: zoom in / zoom out only.
 * Pinch and Ctrl/Cmd+wheel remain the primary gesture; this is not a 3-step density strip.
 */
export function ProjectDashboardKanbanZoomControl({
  level,
  onLevelChange,
}: {
  level: KanbanZoomLevel;
  onLevelChange: (level: KanbanZoomLevel) => void;
}) {
  const canZoomIn = stepKanbanZoomLevel(level, "in") !== level;
  const canZoomOut = stepKanbanZoomLevel(level, "out") !== level;

  return (
    <div
      className="inline-flex items-center rounded-md border border-border/60 bg-background/80"
      role="group"
      aria-label="Kanban zoom"
    >
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!canZoomOut}
        onClick={() => onLevelChange(stepKanbanZoomLevel(level, "out"))}
        className="inline-flex size-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      >
        <ZoomOut className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!canZoomIn}
        onClick={() => onLevelChange(stepKanbanZoomLevel(level, "in"))}
        className="inline-flex size-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      >
        <ZoomIn className="size-4" />
      </button>
    </div>
  );
}
