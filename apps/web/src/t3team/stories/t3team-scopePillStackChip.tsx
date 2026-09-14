/**
 * V4 — Stack + chip (story-only, 2026-09-14). Flat discs that overlap like stacked coins.
 * Depth is occlusion only: where a disc lies on its neighbour, the covered disc carries a
 * soft inset crescent along the covered edge — nothing radiates outward, no ring, no glow.
 * Later discs sit on top; the selection tops everything, lifts a pixel and unfolds its name
 * (animated width/opacity). "All" is always present; the row shows as many recent projects
 * as the container fits and hands the rest to the ⋯ menu.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { cn } from "~/lib/utils";

import { Pill, entries, type ScopeVariantProps } from "./t3team-scopePillVariants";

const DISC = 28; // px, h-7
const OVERLAP = 8; // px each disc hides of the previous one
const CHIP_LABEL = 84; // px reserved for the unfolded name

/** How many project discs fit next to the "All" disc in `width` px. */
function discsThatFit(width: number): number {
  const remaining = width - DISC - CHIP_LABEL;
  return remaining <= 0 ? 0 : Math.floor(remaining / (DISC - OVERLAP));
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function CastShadow({ left }: { left: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-px size-7 rounded-full"
      style={{ left, boxShadow: "0 0 5px 1.5px rgba(0,0,0,0.20)" }}
    />
  );
}

export function ScopeStackChipVariant({
  groups,
  activeScopeKey,
  onSelectScope,
}: ScopeVariantProps) {
  const [ref, width] = useWidth();
  const all = entries(groups);
  const capacity = discsThatFit(width);
  // "All" always; then the leading (most recent) projects that fit, plus the active one
  // if it fell off the end — a scope you cannot see is a scope you cannot clear.
  const projects = all.slice(1);
  let shown = projects.slice(0, capacity);
  const active = projects.find((p) => p.key === activeScopeKey);
  if (active && !shown.includes(active))
    shown = [...shown.slice(0, Math.max(0, capacity - 1)), active];
  const items = [all[0]!, ...shown];
  const activeIndex = items.findIndex((p) => p.key === activeScopeKey);

  return (
    <div ref={ref} className="flex min-w-0 flex-1 items-center overflow-hidden">
      <div className="flex items-center">
        {items.map((entry, index) => {
          const isActive = index === activeIndex;
          // The disc after this one covers its right edge — unless this one is the lifted
          // selection. The disc right after the selection is covered on its LEFT edge.
          const coveredRight = !isActive && index < items.length - 1;
          const coveredLeft = activeIndex >= 0 && index === activeIndex + 1;
          return (
            <Pill
              key={entry.key ?? "all"}
              active={isActive}
              label={entry.label}
              onClick={() => onSelectScope(entry.key)}
              style={{
                zIndex: isActive ? items.length + 1 : index + 1,
                marginLeft: index === 0 ? 0 : -OVERLAP,
              }}
              className={cn(
                "h-7 min-w-7 gap-1.5 overflow-hidden rounded-full border border-border/70 bg-card dark:bg-sidebar-accent",
                isActive
                  ? "-translate-y-px px-1 pr-2.5 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Cast shadow: a shadow-only circle standing exactly where the covering disc
                  is, clipped by this disc — so the shade follows the upper disc's curve and
                  exists nowhere else. */}
              {coveredRight ? <CastShadow left={DISC - OVERLAP - 1} /> : null}
              {coveredLeft ? <CastShadow left={-(DISC - OVERLAP) + 1} /> : null}
              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                {entry.icon}
              </span>
              <span
                className={cn(
                  "inline-block overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity,margin] duration-200 ease-out",
                  isActive ? "max-w-28 opacity-100" : "-ml-1.5 max-w-0 opacity-0",
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
