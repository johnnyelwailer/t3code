/**
 * Size the first-run setup window so its content fits inside the display's work
 * area: a preferred size when the screen is large enough, clamped when it is
 * not, never larger than a sensible max. Pure; the caller supplies the work area.
 */

export type WorkArea = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type SetupWindowBounds = {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
};

/** Wide enough for the two-column setup grid, tall enough for header, sections and footer. */
export const SETUP_WINDOW_PREFERRED = { width: 1280, height: 900 } as const;
export const SETUP_WINDOW_MIN = { width: 800, height: 600 } as const;
export const SETUP_WINDOW_MAX = { width: 1600, height: 1100 } as const;
/** Keep the window clear of the OS menu bar and taskbar. */
export const SETUP_WINDOW_WORK_AREA_MARGIN = 24;

type DisplayLike = {
  readonly workArea?: WorkArea;
  readonly bounds?: WorkArea;
};

/** The Electron `screen` methods this helper needs. All optional so a partial mock is safe. */
export type ScreenLike = {
  readonly getCursorScreenPoint?: () => { x: number; y: number };
  readonly getDisplayMatching?: (rect: WorkArea) => DisplayLike;
  readonly getDisplayNearestPoint?: (point: { x: number; y: number }) => DisplayLike;
  readonly getPrimaryDisplay?: () => DisplayLike;
};

export function sizeSetupWindowToWorkArea(workArea: WorkArea): SetupWindowBounds {
  const availableWidth = Math.max(0, workArea.width - SETUP_WINDOW_WORK_AREA_MARGIN * 2);
  const availableHeight = Math.max(0, workArea.height - SETUP_WINDOW_WORK_AREA_MARGIN * 2);
  const width = fitAxis(
    SETUP_WINDOW_PREFERRED.width,
    availableWidth,
    SETUP_WINDOW_MIN.width,
    SETUP_WINDOW_MAX.width,
  );
  const height = fitAxis(
    SETUP_WINDOW_PREFERRED.height,
    availableHeight,
    SETUP_WINDOW_MIN.height,
    SETUP_WINDOW_MAX.height,
  );
  return {
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}

/**
 * Preferred size, capped by `max` and the usable work area. `min` applies only
 * when the work area can still hold it; otherwise the window fills the usable
 * area (the page scrolls, and the footer stays reachable).
 */
function fitAxis(preferred: number, available: number, min: number, max: number): number {
  const fitted = Math.min(preferred, max, available);
  if (available >= min) return Math.max(min, fitted);
  return Math.max(1, Math.floor(available));
}

export function readDisplayWorkArea(screen: ScreenLike | null | undefined): WorkArea | null {
  try {
    if (screen == null) return null;
    const point = screen.getCursorScreenPoint?.() ?? { x: 0, y: 0 };
    const probe: WorkArea = { x: point.x, y: point.y, width: 1, height: 1 };
    const display =
      screen.getDisplayMatching?.(probe) ??
      screen.getDisplayNearestPoint?.(point) ??
      screen.getPrimaryDisplay?.();
    const area = display?.workArea ?? display?.bounds;
    if (area == null || area.width <= 0 || area.height <= 0) return null;
    return { x: area.x, y: area.y, width: area.width, height: area.height };
  } catch {
    return null;
  }
}

/** `null` when the screen API is unavailable; the caller keeps its existing default. */
export function sizeSetupWindowFromScreen(
  screen: ScreenLike | null | undefined,
): SetupWindowBounds | null {
  const workArea = readDisplayWorkArea(screen);
  return workArea === null ? null : sizeSetupWindowToWorkArea(workArea);
}
