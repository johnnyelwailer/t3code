/**
 * Semantic zoom for the My Work kanban board (flat + hierarchy/matrix).
 *
 * Continuous inertial progress (0 = full … 2 = at-a-glance) with three snap points.
 * Pinch / Ctrl+wheel drives progress 1:1 like platform zoom; on release, a short velocity
 * bias soft-snaps to the nearest detent. Persisted state stays the discrete snap.
 *
 * Layout is REAL geometry (lane min-widths, opacities) — not CSS transform:scale — so
 * dnd-kit pointer deltas stay aligned with drop targets.
 */

export type KanbanZoomLevel = "full" | "compact" | "at-a-glance";

export const KANBAN_ZOOM_LEVELS: readonly KanbanZoomLevel[] = ["full", "compact", "at-a-glance"];

/**
 * Lane min-width at each snap (rem). Continuous zoom lerps between these.
 * Glance is narrow enough that a typical 5-lane board fits without horizontal scroll.
 */
export const KANBAN_ZOOM_LANE_WIDTH_REM = [17, 11, 6.75] as const;

/** Horizontal lane gap at each snap (rem). */
export const KANBAN_ZOOM_COLUMN_GAP_REM = [0.75, 0.5, 0.35] as const;

/** Settle spring after inertia dies (ms). */
export const KANBAN_ZOOM_SNAP_MS = 240;

export const kanbanZoomLevelValues = new Set<KanbanZoomLevel>(KANBAN_ZOOM_LEVELS);

export function isKanbanZoomLevel(value: unknown): value is KanbanZoomLevel {
  return typeof value === "string" && kanbanZoomLevelValues.has(value as KanbanZoomLevel);
}

/** Persistence validation: any value outside the enum falls back to `fallback` (default "full"). */
export function resolveKanbanZoomLevel(
  value: unknown,
  fallback: KanbanZoomLevel = "full",
): KanbanZoomLevel {
  return isKanbanZoomLevel(value) ? value : fallback;
}

export function kanbanZoomLevelToProgress(level: KanbanZoomLevel): number {
  const index = KANBAN_ZOOM_LEVELS.indexOf(level);
  return index < 0 ? 0 : index;
}

export function clampKanbanZoomProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(KANBAN_ZOOM_LEVELS.length - 1, Math.max(0, progress));
}

/** Nearest snap point for a continuous progress value. */
export function snapKanbanZoomProgress(progress: number): KanbanZoomLevel {
  const clamped = clampKanbanZoomProgress(progress);
  const index = Math.round(clamped);
  return KANBAN_ZOOM_LEVELS[index] ?? "full";
}

/** Steps one snap toward full ("in") or toward at-a-glance ("out"); clamped at both ends. */
export function stepKanbanZoomLevel(
  level: KanbanZoomLevel,
  direction: "in" | "out",
): KanbanZoomLevel {
  const index = KANBAN_ZOOM_LEVELS.indexOf(level);
  const next = direction === "out" ? index + 1 : index - 1;
  const clamped = Math.max(0, Math.min(KANBAN_ZOOM_LEVELS.length - 1, next));
  return KANBAN_ZOOM_LEVELS[clamped] ?? level;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Piecewise-linear lane width across the continuous progress domain. */
export function kanbanZoomLaneMinWidthRem(progress: number): number {
  const p = clampKanbanZoomProgress(progress);
  if (p <= 1) return lerp(KANBAN_ZOOM_LANE_WIDTH_REM[0], KANBAN_ZOOM_LANE_WIDTH_REM[1], p);
  return lerp(KANBAN_ZOOM_LANE_WIDTH_REM[1], KANBAN_ZOOM_LANE_WIDTH_REM[2], p - 1);
}

export function kanbanZoomColumnGapRem(progress: number): number {
  const p = clampKanbanZoomProgress(progress);
  if (p <= 1) return lerp(KANBAN_ZOOM_COLUMN_GAP_REM[0], KANBAN_ZOOM_COLUMN_GAP_REM[1], p);
  return lerp(KANBAN_ZOOM_COLUMN_GAP_REM[1], KANBAN_ZOOM_COLUMN_GAP_REM[2], p - 1);
}

/**
 * Continuous visual derived from zoom progress. Opacities drive detail fade so the board
 * morphs during a pinch instead of swapping discrete card trees mid-gesture.
 */
export interface KanbanZoomVisual {
  readonly progress: number;
  readonly snappedLevel: KanbanZoomLevel;
  readonly laneMinWidthRem: number;
  readonly columnGapRem: number;
  /** 1 at full, 0 once past compact. */
  readonly laneHeaderBorderOpacity: number;
  readonly iconOpacity: number;
  readonly keyOpacity: number;
  readonly statusOpacity: number;
  readonly priorityOpacity: number;
  readonly updatedOpacity: number;
  readonly assigneeNameOpacity: number;
  readonly avatarOpacity: number;
  /**
   * 0 = full title size / up to 2 lines; ~0.5 = compact smaller type but still 2 lines
   * (more of the title visible); 1 = glance single-line micro type.
   */
  readonly titleDensity: number;
  /** Title font size in rem — shrinks through compact and glance. */
  readonly titleFontSizeRem: number;
  readonly cardPaddingRem: number;
  /** Prefer the dense key+title+avatar row once denser than halfway to glance. */
  readonly titleAvatarLayout: boolean;
  /**
   * Matrix grouping shell chrome. Radius must stay ≤ inset so nested cards never poke through
   * the rounded corner (the previous 1.35rem radius with 4px inset caused the clip/overlap).
   */
  readonly shellRadiusRem: number;
  readonly shellInsetStartPx: number;
  readonly shellInsetEndPx: number;
  readonly shellBorderWidthPx: number;
  /** Horizontal pad on matrix cards so they sit inside the shell curve. */
  readonly matrixCardInsetPx: number;
}

export function resolveKanbanZoomVisual(progress: number): KanbanZoomVisual {
  const p = clampKanbanZoomProgress(progress);
  // Radius shrinks with density; inset stays ≥ radius so corners clear card chrome.
  const shellRadiusRem = lerp(0.85, 0.45, smoothstep(0, 2, p));
  const shellInsetStartPx = Math.round(lerp(14, 8, smoothstep(0, 2, p)));
  const shellInsetEndPx = Math.round(lerp(16, 9, smoothstep(0, 2, p)));
  return {
    progress: p,
    snappedLevel: snapKanbanZoomProgress(p),
    laneMinWidthRem: kanbanZoomLaneMinWidthRem(p),
    columnGapRem: kanbanZoomColumnGapRem(p),
    laneHeaderBorderOpacity: 1 - smoothstep(0, 0.55, p),
    // Work-item type icon stays visible at every snap — including glance.
    iconOpacity: 1,
    // Ticket key stays visible at every snap — including glance.
    keyOpacity: 1,
    statusOpacity: 1 - smoothstep(0.15, 0.75, p),
    priorityOpacity: 1 - smoothstep(0.15, 0.75, p),
    // Full: visible. Compact+: fades out (narrow lanes can't spare the meta slot).
    updatedOpacity: 1 - smoothstep(0.35, 1.05, p),
    assigneeNameOpacity: 1 - smoothstep(0.2, 0.85, p),
    avatarOpacity: smoothstep(0.35, 0.95, p),
    titleDensity: smoothstep(0.35, 1.85, p),
    // 11px → ~9.5px at compact → ~8.5px at glance
    titleFontSizeRem: lerp(0.6875, 0.53125, smoothstep(0, 2, p)),
    cardPaddingRem: lerp(0.5, 0.35, smoothstep(0, 2, p)),
    titleAvatarLayout: p >= 1.45,
    shellRadiusRem,
    shellInsetStartPx,
    shellInsetEndPx,
    shellBorderWidthPx: p >= 1.45 ? 1 : 1.5,
    matrixCardInsetPx: Math.round(lerp(10, 6, smoothstep(0, 2, p))),
  };
}

/** Discrete snap configs — used by +/- chrome and tests; live rendering uses {@link resolveKanbanZoomVisual}. */
export interface KanbanZoomLevelConfig {
  readonly laneMinWidthRem: number;
  readonly laneHeader: "full" | "compact";
  readonly showIssueTypeIcon: boolean;
  readonly showTicketKey: boolean;
  readonly showStatusChip: boolean;
  readonly showPriorityChip: boolean;
  readonly showUpdatedAt: boolean;
  readonly showAssigneeName: boolean;
  readonly showAssigneeAvatar: boolean;
  readonly cardLayout: "stack" | "title-avatar";
}

export const KANBAN_ZOOM_CONFIG: Record<KanbanZoomLevel, KanbanZoomLevelConfig> = {
  full: {
    laneMinWidthRem: KANBAN_ZOOM_LANE_WIDTH_REM[0],
    laneHeader: "full",
    showIssueTypeIcon: true,
    showTicketKey: true,
    showStatusChip: true,
    showPriorityChip: true,
    showUpdatedAt: true,
    showAssigneeName: true,
    showAssigneeAvatar: false,
    cardLayout: "stack",
  },
  compact: {
    laneMinWidthRem: KANBAN_ZOOM_LANE_WIDTH_REM[1],
    laneHeader: "compact",
    showIssueTypeIcon: true,
    showTicketKey: true,
    showStatusChip: false,
    showPriorityChip: false,
    showUpdatedAt: false,
    showAssigneeName: false,
    showAssigneeAvatar: true,
    cardLayout: "stack",
  },
  "at-a-glance": {
    laneMinWidthRem: KANBAN_ZOOM_LANE_WIDTH_REM[2],
    laneHeader: "compact",
    showIssueTypeIcon: true,
    showTicketKey: true,
    showStatusChip: false,
    showPriorityChip: false,
    showUpdatedAt: false,
    showAssigneeName: false,
    showAssigneeAvatar: true,
    cardLayout: "title-avatar",
  },
};
