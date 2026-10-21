/**
 * The host side of `surface.companion`: one small, decorative character per placement (My Work
 * loading, My Work empty, a new thread). Unlike the other slots it renders ONE view, not every
 * registration: the first one that lists the placement, in registration order. With none — or
 * with companions switched off — it renders the surface's own `fallback` (the neutral loading
 * mark, or nothing), so mounting the slot changes nothing until a pack fills it. A companion that
 * throws is replaced by that same fallback.
 *
 * The companion is always `aria-hidden` decoration beside text that says the state; it never
 * carries the state alone.
 */
import type {
  ModelStageQuality,
  SurfaceCompanionMood,
  SurfaceCompanionPlacement,
  SurfaceCompanionSize,
} from "@t3team/pack-ui/contract";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import { appViewRegistry } from "./t3team-appViewRegistry";
import { ViewInstance } from "./t3team-ViewInstance";
import type { SurfaceCompanionEntry, ViewRegistry } from "./t3team-viewRegistry";

/** The viewer's say over companions: off entirely, or a ceiling on their rendering cost. */
export interface CompanionPreferences {
  readonly enabled: boolean;
  readonly quality: ModelStageQuality;
}

export const DEFAULT_COMPANION_PREFERENCES: CompanionPreferences = {
  enabled: true,
  quality: "auto",
};

/** Stories (before/after, quality) and a future setting provide this; the app default is on/auto. */
export const CompanionPreferencesContext = createContext<CompanionPreferences>(
  DEFAULT_COMPANION_PREFERENCES,
);

/** Edge of the companion's box per size, in CSS pixels. */
export const COMPANION_SIZE_PX: Record<SurfaceCompanionSize, number> = { sm: 48, md: 120, lg: 200 };

/** The one companion a placement shows: the first registration that lists it (or lists none). */
export function companionFor(
  registry: Pick<ViewRegistry<never>, "list">,
  placement: SurfaceCompanionPlacement,
): SurfaceCompanionEntry | undefined {
  return registry
    .list("surface.companion")
    .find((entry) => entry.placements === undefined || entry.placements.includes(placement));
}

export function T3TeamCompanionSlot({
  placement,
  mood,
  size,
  fallback = null,
  className,
}: {
  readonly placement: SurfaceCompanionPlacement;
  readonly mood: SurfaceCompanionMood;
  readonly size: SurfaceCompanionSize;
  /** What the surface shows without a companion (and when one throws). */
  readonly fallback?: ReactNode;
  /** Layout around the companion only; never applied to the fallback. */
  readonly className?: string;
}) {
  const { enabled, quality } = useContext(CompanionPreferencesContext);
  const entry = enabled ? companionFor(appViewRegistry(), placement) : undefined;
  if (entry === undefined) return fallback;
  const edge = COMPANION_SIZE_PX[size];
  return (
    <ViewInstance owner={entry.owner} resetKeys={[placement, mood, size]} fallback={fallback}>
      <div
        className={cn("shrink-0", className)}
        style={{ minWidth: edge, minHeight: edge }}
        aria-hidden
        data-companion-placement={placement}
        data-companion-mood={mood}
      >
        <entry.component placement={placement} mood={mood} size={size} quality={quality} />
      </div>
    </ViewInstance>
  );
}

/** How long `cleared` lasts after the last item goes, before the surface is just `empty`. */
export const COMPANION_CLEARED_HOLD_MS = 8000;

/**
 * True for a while after `empty` turns on while mounted (the viewer just cleared the surface),
 * false when it was empty from the start: the difference between `cleared` and `empty`.
 */
export function useJustCleared(empty: boolean, holdMs = COMPANION_CLEARED_HOLD_MS): boolean {
  const [previous, setPrevious] = useState(empty);
  const [cleared, setCleared] = useState(false);
  if (previous !== empty) {
    setPrevious(empty);
    setCleared(empty);
  }
  useEffect(() => {
    if (!cleared) return;
    const timer = window.setTimeout(() => setCleared(false), holdMs);
    return () => window.clearTimeout(timer);
  }, [cleared, holdMs]);
  return cleared;
}
