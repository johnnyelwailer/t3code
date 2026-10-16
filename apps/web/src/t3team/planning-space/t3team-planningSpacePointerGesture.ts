/**
 * Pointer-gesture state + the wheel/pointer-down/ghost handlers for the planning
 * space stage. Holds the per-subscription mutable gesture state (pan delta, drop
 * hot element, multitouch pointers/pinch) shared with the move/up handlers in
 * t3team-planningSpacePointerEffect.ts. Extracted verbatim from
 * t3team-PlanningSpaceView.tsx.
 */

import type { MutableRefObject } from "react";

import type { PlanningSpaceEngine } from "./t3team-planningSpaceRenderer";
import type { PlanningSpaceCtx } from "./t3team-planningSpaceControllerTypes";
import { createWheelClassifier, wheelIntent } from "./t3team-planningSpaceWheelIntent";

export interface PlanningPointerGesture {
  lastPan: { dx: number; dy: number };
  dropHotEl: Element | null;
  activePointers: Map<number, { x: number; y: number }>;
  pinch: { distance: number; midX: number; midY: number } | null;
  pinchFrom(): { distance: number; midX: number; midY: number } | null;
  clearDropHot(): void;
  positionGhost(event: PointerEvent): void;
  onWheel(event: WheelEvent): void;
  onPointerDown(event: PointerEvent): void;
}

export function createPlanningPointerGesture(
  ctxRef: MutableRefObject<PlanningSpaceCtx>,
  stage: HTMLDivElement,
  engine: PlanningSpaceEngine,
): PlanningPointerGesture {
  const wheelClassifier = createWheelClassifier();
  const g: PlanningPointerGesture = {
    lastPan: { dx: 0, dy: 0 },
    dropHotEl: null,
    // Multitouch (§3.1): two pointers = pinch zoom + pan; any machine gesture
    // in progress is cancelled the moment the second finger lands.
    activePointers: new Map<number, { x: number; y: number }>(),
    pinch: null,
    pinchFrom() {
      const [a, b] = [...g.activePointers.values()];
      if (!a || !b) return null;
      return {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
    },
    clearDropHot() {
      g.dropHotEl?.removeAttribute("data-drop-hot");
      g.dropHotEl = null;
    },
    positionGhost(event: PointerEvent) {
      const ghost = ctxRef.current.ghostRef.current;
      if (!ghost || ghost.style.display === "none") return;
      const rect = stage.getBoundingClientRect();
      ghost.style.left = `${event.clientX - rect.left + 12}px`;
      ghost.style.top = `${event.clientY - rect.top - 20}px`;
    },
    onWheel(event: WheelEvent) {
      const c = ctxRef.current;
      // Chrome regions (panel, menus) keep native scrolling (§3.5 analogue).
      if ((event.target as Element).closest("[data-ps-chrome]")) return;
      event.preventDefault();
      c.userNavigated.current = true;
      c.lastInputAt.current = performance.now();
      const legacy = event as WheelEvent & { wheelDeltaY?: number; wheelDeltaX?: number };
      const sample = {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        wheelDeltaY: legacy.wheelDeltaY,
        wheelDeltaX: legacy.wheelDeltaX,
        timeStamp: event.timeStamp,
      };
      // Mouse wheel zooms at the pointer (Shift pans x, Ctrl/⌘ pans y);
      // trackpad scroll pans and pinch zooms. See t3team-planningSpaceWheelIntent.ts.
      const intent = wheelIntent(sample, wheelClassifier.device(sample));
      c.setAllModeRef.current(false);
      if (intent.kind === "zoom") {
        const rect = stage.getBoundingClientRect();
        engine.zoomAtCursor(event.clientX - rect.left, event.clientY - rect.top, intent.delta);
      } else {
        // Scroll-panning is deliberate repositioning; release the snap pin so
        // the Full-band magnet doesn't tug back.
        c.snapTargetRef.current = null;
        engine.panByScreenDelta(intent.dx, intent.dy);
      }
    },
    onPointerDown(event: PointerEvent) {
      const c = ctxRef.current;
      if (event.pointerType === "touch") {
        g.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (g.activePointers.size === 2) {
          c.machineState.current = { ...c.machineState.current, pointer: null, dragging: null };
          c.setDragActive(false);
          const ghost = c.ghostRef.current;
          if (ghost) ghost.style.display = "none";
          g.pinch = g.pinchFrom();
          return;
        }
      }
      if (event.button !== 0) return;
      const targetEl = event.target as Element;
      // Chrome regions (panel, gauge, rail toggle) own their clicks — except
      // owner affordances, which must reach the machine from every surface.
      if (
        targetEl.closest("[data-ps-chrome]") &&
        !targetEl.closest("[data-owner-affordance]") &&
        !targetEl.closest("[data-dock]")
      ) {
        return;
      }
      c.setContextMenu(null);
      c.setContextMenu(null);
      const hit = c.handlers.hitOf(targetEl);
      if (hit.type !== "background") c.userNavigated.current = true;
      g.lastPan = { dx: 0, dy: 0 };
      const ghost = c.ghostRef.current;
      if (ghost) {
        ghost.textContent =
          hit.type === "subtask"
            ? (c.vm.storyById
                .get(hit.storyId)
                ?.subtasks.find((s) => s.id === hit.subtaskId)
                ?.title.slice(0, 36) ?? "")
            : hit.type === "ownerHeader" || hit.type === "dock"
              ? c.handlers.ownerNameOf(hit.ownerId)
              : "";
      }
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events (tests, storybook automation) have no active pointer.
      }
      c.handlers.dispatch({ type: "pointerDown", hit, x: event.clientX, y: event.clientY });
    },
  };
  return g;
}
