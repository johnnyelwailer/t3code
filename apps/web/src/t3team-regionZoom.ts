/**
 * Ctrl/Cmd+scroll hover-zoom: scales the marked region under the cursor —
 * `[data-zoom-region]` panes (PR code diff wrapper, chat timeline viewport)
 * and sidebar thread rows (`[data-thread-item]`) — instead of Chromium's
 * native whole-page zoom.
 *
 * Mounted once from the root route view (routes/__root.tsx). Outside any
 * region the gesture is left alone so the native page zoom keeps working. A zoomed region returns to 1× ~600ms
 * after the pointer leaves it.
 *
 * Limitations:
 * - Native Ctrl/Cmd+wheel zoom is a browser-process feature in
 *   Chromium/Electron (`webPreferences.zoomOnControl`); whether a
 *   renderer-side capture `preventDefault` actually suppresses it needs live
 *   confirmation in the desktop app. If it does not, the fallback is
 *   `zoomOnControl: false` on the main window plus the existing menu zoom.
 * - While a dnd-kit row is being dragged (`data-dnd-dragging`), zoom is
 *   skipped so the gesture belongs to the drag.
 */

/** Step of one accumulated wheel notch. */
const ZOOM_STEP = 1.08;
/** Wheel delta (px) that counts as one step; mouse notches and trackpad
 * pinches both accumulate into this. */
const ZOOM_NOTCH_PX = 100;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;
/** Quiet time after the pointer leaves the region before it returns to 1×. */
const RESET_DELAY_MS = 600;
/** Optional smoothing, skipped under prefers-reduced-motion. */
const ZOOM_TRANSITION_MS = 80;

const ZOOM_SELECTOR = "[data-zoom-region],[data-thread-item]";

/** Per-region zoom factor. */
const zoomFactors = new WeakMap<Element, number>();
/** Per-region un-spent wheel delta. */
const wheelDebt = new WeakMap<Element, number>();
/** Per-region reset timer id. */
const resetTimers = new WeakMap<Element, number>();

/** Cached prefers-reduced-motion, read when needed. */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Innermost zoom region on the event's composed path, or null. composedPath
 * is walked (instead of target.closest) so regions behind shadow roots and
 * custom elements are still found. A dnd-kit row being dragged on the path
 * counts as no region: the gesture belongs to the drag. */
function findZoomRegion(event: Event): Element | null {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) break;
    if (node.hasAttribute("data-dnd-dragging")) return null;
    if (node.matches(ZOOM_SELECTOR)) return node;
  }
  return null;
}

function setZoom(region: Element, factor: number, animate: boolean): void {
  const style = (region as HTMLElement).style;
  // An interrupted animation would linger on the element, so always clear
  // the transition when it should not animate.
  style.transition = animate ? `zoom ${ZOOM_TRANSITION_MS}ms linear` : "";
  style.setProperty("zoom", String(factor));
  zoomFactors.set(region, factor);
}

function resetZoom(region: Element): void {
  resetTimers.delete(region);
  const factor = zoomFactors.get(region);
  if (factor === undefined || factor === 1) return;
  setZoom(region, 1, !prefersReducedMotion());
  zoomFactors.delete(region);
  wheelDebt.delete(region);
}

/** Reschedules the 1× restore 600ms after the pointer left the region. */
function scheduleReset(region: Element): void {
  const previous = resetTimers.get(region);
  if (previous !== undefined) window.clearTimeout(previous);
  resetTimers.set(
    region,
    window.setTimeout(() => {
      if (region.isConnected) resetZoom(region);
    }, RESET_DELAY_MS),
  );
}

const handleWheel = (event: WheelEvent) => {
  if ((!event.ctrlKey && !event.metaKey) || event.buttons !== 0 || event.deltaY === 0) return;
  const region = findZoomRegion(event);
  if (region === null) return; // no region: let the native page zoom happen
  event.preventDefault();
  const factor = zoomFactors.get(region) ?? 1;
  if (factor === MIN_ZOOM || factor === MAX_ZOOM) return;
  // Accumulate into notches so mouse notches and small trackpad-pinch deltas
  // move the zoom at the same, predictable rate.
  let debt = (wheelDebt.get(region) ?? 0) + event.deltaY;
  if (Math.abs(debt) < ZOOM_NOTCH_PX) {
    wheelDebt.set(region, debt);
    return;
  }
  const steps = Math.sign(debt);
  debt -= ZOOM_NOTCH_PX * steps;
  const next = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, factor * (steps < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)),
  );
  wheelDebt.set(region, debt);
  if (next === factor) return;
  setZoom(region, next, !prefersReducedMotion());
};

/** Restores the region to 1× 600ms after the pointer left it. Moving between
 * children of the region (relatedTarget still inside) does not reset. */
const handlePointerOut = (event: PointerEvent) => {
  const region = findZoomRegion(event);
  if (region === null) return;
  if (zoomFactors.get(region) === undefined) return;
  const next = event.relatedTarget;
  if (next instanceof Node && region.contains(next)) return;
  scheduleReset(region);
};

/** Installs the document-level capture listeners; returns the remover.
 * Idempotent per effect cycle (React StrictMode mounts the effect twice in
 * dev). */
export function startRegionZoom(): () => void {
  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  document.addEventListener("pointerout", handlePointerOut, true);
  return () => {
    document.removeEventListener("wheel", handleWheel, true);
    document.removeEventListener("pointerout", handlePointerOut, true);
  };
}
