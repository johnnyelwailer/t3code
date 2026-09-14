/**
 * V4 — Stack + chip (story-only, 2026-09-14). V1's overlapping discs sitting in V2's soft
 * track. The selected disc lifts out of the pile and unfolds into a chip with the project
 * name; the name's width and opacity are animated so the row re-flows smoothly rather than
 * jumping. Depth comes from three things: z-order runs left→right (the leftmost disc is on
 * top, like a fanned deck), every disc casts a soft shadow onto the one it covers, and the
 * fill is a slight top-lit gradient. The overlap relaxes as the container widens.
 */
import { cn } from "~/lib/utils";

import { Pill, entries, type ScopeVariantProps } from "./t3team-scopePillVariants";

export function ScopeStackChipVariant({
  groups,
  activeScopeKey,
  onSelectScope,
}: ScopeVariantProps) {
  const items = entries(groups);
  return (
    <div className="@container/pills flex min-w-0 flex-1 items-center overflow-hidden">
      <div className="flex min-w-0 items-center rounded-full bg-muted py-0.5 pr-1 pl-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
        {items.map((entry, index) => {
          const active = entry.key === activeScopeKey;
          return (
            <Pill
              key={entry.key ?? "all"}
              active={active}
              label={entry.label}
              onClick={() => onSelectScope(entry.key)}
              // Fanned deck: earlier discs sit on top of later ones; the selection tops all.
              style={{ zIndex: active ? items.length + 1 : items.length - index }}
              className={cn(
                "h-7 min-w-7 gap-1.5 rounded-full border border-black/10 bg-gradient-to-b from-card to-muted/80 shadow-[3px_0_6px_-1px_rgba(0,0,0,0.22)] dark:border-white/10 dark:from-card dark:to-black/20",
                index > 0 && "-ml-3 @[15rem]/pills:-ml-2 @[19rem]/pills:-ml-1",
                active
                  ? "px-1 text-foreground shadow-[0_2px_6px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.06)] @[15rem]/pills:pr-2.5"
                  : "text-muted-foreground hover:-translate-y-px hover:text-foreground",
              )}
            >
              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                {entry.icon}
              </span>
              {/* Name unfolds: max-width + opacity animate, so the neighbours slide, not jump. */}
              <span
                className={cn(
                  "hidden overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity,margin] duration-200 ease-out @[15rem]/pills:inline-block",
                  active ? "max-w-28 opacity-100" : "-ml-1.5 max-w-0 opacity-0",
                )}
              >
                {entry.label}
              </span>
            </Pill>
          );
        })}
      </div>
    </div>
  );
}
