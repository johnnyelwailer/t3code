import { useEffect, useRef, useState } from "react";

import {
  KANBAN_ZOOM_SNAP_MS,
  clampKanbanZoomProgress,
  kanbanZoomLevelToProgress,
  snapKanbanZoomProgress,
  type KanbanZoomLevel,
} from "~/t3team/t3team-kanbanZoom";

/**
 * Platform-like inertial pinch zoom for the flat kanban board.
 *
 * Ctrl/Cmd+wheel and trackpad pinch (Chromium sets ctrlKey) drive a continuous progress
 * value 1:1 with delta. On gesture end, a short velocity bias picks the nearest snap and
 * the value springs there, then commits via onLevelChange.
 *
 * Native NON-passive wheel listener: React's onWheel is passive, so preventDefault there
 * cannot stop browser page zoom.
 */

/** Progress units per wheel deltaY pixel — tuned to feel like OS pinch, not stepped clicks. */
export const KANBAN_ZOOM_WHEEL_SENSITIVITY = 0.0055;

/** Quiet period after the last wheel event before inertia / snap starts. */
export const KANBAN_ZOOM_GESTURE_IDLE_MS = 90;

/**
 * Maps residual wheel velocity into a snap bias. Clamped so a fast flick can tip you
 * into the next snap, but cannot skip an entire snap from a single gesture end.
 */
export const KANBAN_ZOOM_INERTIA_BIAS_SCALE = 6;
export const KANBAN_ZOOM_INERTIA_BIAS_MAX = 0.45;

export function useKanbanZoomGesture(input: {
  enabled: boolean;
  level: KanbanZoomLevel;
  onLevelChange: (level: KanbanZoomLevel) => void;
}): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  progress: number;
  isGesturing: boolean;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(() => kanbanZoomLevelToProgress(input.level));
  const [isGesturing, setIsGesturing] = useState(false);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const levelRef = useRef(input.level);
  levelRef.current = input.level;
  const onLevelChangeRef = useRef(input.onLevelChange);
  onLevelChangeRef.current = input.onLevelChange;

  const velocityRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const gesturingRef = useRef(false);
  const animatingRef = useRef(false);

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const cancelIdle = () => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const commitIfNeeded = (nextProgress: number) => {
    const snapped = snapKanbanZoomProgress(nextProgress);
    if (snapped !== levelRef.current) {
      onLevelChangeRef.current(snapped);
    }
  };

  const springTo = (targetProgress: number) => {
    cancelRaf();
    animatingRef.current = true;
    const start = progressRef.current;
    const delta = targetProgress - start;
    if (Math.abs(delta) < 0.001) {
      progressRef.current = targetProgress;
      setProgress(targetProgress);
      animatingRef.current = false;
      gesturingRef.current = false;
      setIsGesturing(false);
      commitIfNeeded(targetProgress);
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / KANBAN_ZOOM_SNAP_MS);
      // Ease-out cubic — settles like a soft OS snap, not a linear scrub.
      const eased = 1 - (1 - t) ** 3;
      const next = start + delta * eased;
      progressRef.current = next;
      setProgress(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      progressRef.current = targetProgress;
      setProgress(targetProgress);
      animatingRef.current = false;
      gesturingRef.current = false;
      setIsGesturing(false);
      commitIfNeeded(targetProgress);
      rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const settleToSnap = () => {
    cancelRaf();
    const rawBias = velocityRef.current * KANBAN_ZOOM_INERTIA_BIAS_SCALE;
    const bias = Math.max(
      -KANBAN_ZOOM_INERTIA_BIAS_MAX,
      Math.min(KANBAN_ZOOM_INERTIA_BIAS_MAX, rawBias),
    );
    const projected = clampKanbanZoomProgress(progressRef.current + bias);
    velocityRef.current = 0;
    const target = kanbanZoomLevelToProgress(snapKanbanZoomProgress(projected));
    springTo(target);
  };

  // Sync from external +/- / persisted level when not mid-gesture.
  useEffect(() => {
    if (gesturingRef.current || animatingRef.current) return;
    const target = kanbanZoomLevelToProgress(input.level);
    if (Math.abs(target - progressRef.current) < 0.001) return;
    springTo(target);
  }, [input.level]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !input.enabled) {
      return;
    }

    const scheduleSettle = () => {
      cancelIdle();
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        settleToSnap();
      }, KANBAN_ZOOM_GESTURE_IDLE_MS);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      cancelIdle();
      cancelRaf();
      animatingRef.current = false;

      const now = performance.now();
      const dt = Math.max(8, Math.min(48, now - (lastEventAtRef.current || now)));
      lastEventAtRef.current = now;

      const deltaProgress = event.deltaY * KANBAN_ZOOM_WHEEL_SENSITIVITY;
      velocityRef.current = deltaProgress * (16 / dt);
      const next = clampKanbanZoomProgress(progressRef.current + deltaProgress);
      progressRef.current = next;
      setProgress(next);

      if (!gesturingRef.current) {
        gesturingRef.current = true;
        setIsGesturing(true);
      }
      scheduleSettle();
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleWheel);
      cancelIdle();
      cancelRaf();
    };
  }, [input.enabled]);

  return { containerRef, progress, isGesturing };
}
