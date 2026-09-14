import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SCOPE_DISC_OVERLAP,
  SCOPE_DISC_SIZE,
  projectScopeCastShadow,
} from "./t3team-sidebarProjectScopePills.logic";

/**
 * One disc of the project scope stack. Flat fill with a hairline; the only depth cue is the
 * shadow the disc one level up casts onto it: a shadow-only circle standing exactly where
 * the covering disc is, clipped by this disc, so the shade follows the upper disc's curve and
 * exists nowhere else. The selection lifts a pixel and unfolds its name with an animated
 * width/opacity so neighbours slide rather than jump.
 */
export function T3TeamSidebarProjectScopeDisc({
  label,
  active,
  depth,
  coveredSide,
  zIndex,
  first,
  onSelect,
  onContextMenu,
  children,
}: {
  label: string;
  active: boolean;
  depth: number;
  coveredSide: "left" | "right" | null;
  zIndex: number;
  first: boolean;
  onSelect: () => void;
  onContextMenu?: ((event: ReactMouseEvent<HTMLElement>) => void) | undefined;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    zIndex,
    marginLeft: first ? 0 : -SCOPE_DISC_OVERLAP,
    transform: active ? "translateY(-1px)" : `scale(${1 - Math.min(depth, 4) * 0.02})`,
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-pressed={active}
            aria-label={label}
            style={style}
            onClick={onSelect}
            onContextMenu={onContextMenu}
            className={cn(
              "relative inline-flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full border border-black/15 bg-card outline-none transition-[margin,transform,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 dark:border-white/20 dark:bg-sidebar-accent",
              active
                ? "px-1 pr-2.5 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        {coveredSide ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-px size-7 rounded-full"
            style={{
              left:
                coveredSide === "right"
                  ? SCOPE_DISC_SIZE - SCOPE_DISC_OVERLAP - 1
                  : -(SCOPE_DISC_SIZE - SCOPE_DISC_OVERLAP) + 1,
              boxShadow: projectScopeCastShadow(depth),
            }}
          />
        ) : null}
        <span className="inline-flex size-4 shrink-0 items-center justify-center">{children}</span>
        <span
          className={cn(
            "inline-block overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity,margin] duration-200 ease-out",
            active ? "max-w-28 opacity-100" : "-ml-1.5 max-w-0 opacity-0",
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      {active ? null : <TooltipPopup side="bottom">{label}</TooltipPopup>}
    </Tooltip>
  );
}
