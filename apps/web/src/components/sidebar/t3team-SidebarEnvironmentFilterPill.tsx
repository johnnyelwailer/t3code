import type { EnvironmentFilterPill } from "@t3tools/client-runtime/t3team-environmentFilter";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";

export const ENVIRONMENT_FILTER_PILL_BASE =
  "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60";
export const ENVIRONMENT_FILTER_PILL_UNSELECTED =
  "border-border bg-card text-muted-foreground hover:text-foreground dark:bg-sidebar-control-surface";
export const ENVIRONMENT_FILTER_PILL_SELECTED = "border-primary/40 bg-primary/10 text-foreground";

export function T3TeamSidebarEnvironmentFilterPill({
  pill,
  onSelect,
  onContextMenu,
}: {
  pill: EnvironmentFilterPill;
  onSelect: (environmentId: string | null) => void;
  onContextMenu?: ((event: ReactMouseEvent<HTMLElement>) => void) | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={pill.selected}
      onClick={() => onSelect(pill.id)}
      onContextMenu={onContextMenu}
      className={cn(
        ENVIRONMENT_FILTER_PILL_BASE,
        pill.selected ? ENVIRONMENT_FILTER_PILL_SELECTED : ENVIRONMENT_FILTER_PILL_UNSELECTED,
      )}
    >
      {pill.label}
    </button>
  );
}

/** The widest +N the row can need, used to reserve room before the split is known. */
export function T3TeamSidebarEnvironmentFilterOverflowMeasure({ count }: { count: number }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={cn(ENVIRONMENT_FILTER_PILL_BASE, ENVIRONMENT_FILTER_PILL_UNSELECTED)}
    >
      +{count}
    </button>
  );
}
