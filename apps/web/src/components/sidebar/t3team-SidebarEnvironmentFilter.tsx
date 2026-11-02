import type { EnvironmentFilterPill } from "@t3tools/client-runtime/t3team-environmentFilter";

import { cn } from "~/lib/utils";

/**
 * One-click environment filter under the project pills: "All" plus one pill per environment the
 * list shows something for. `pills` is null while there is nothing to choose, and nothing draws.
 * The row wraps at a narrow sidebar; a pill only truncates when its label alone outgrows the row.
 */
export function T3TeamSidebarEnvironmentFilter({
  pills,
  onSelect,
}: {
  pills: ReadonlyArray<EnvironmentFilterPill> | null;
  onSelect: (environmentId: string | null) => void;
}) {
  if (pills === null) return null;
  return (
    <div
      role="group"
      aria-label="Environment"
      className="flex min-w-0 flex-wrap items-center gap-1 py-0.5 pr-2 pl-2"
    >
      {pills.map((pill) => (
        <button
          key={pill.id ?? "all"}
          type="button"
          aria-pressed={pill.selected}
          onClick={() => onSelect(pill.id)}
          className={cn(
            "inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
            pill.selected
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground dark:bg-sidebar-control-surface",
          )}
        >
          <span className="truncate">{pill.label}</span>
        </button>
      ))}
    </div>
  );
}
