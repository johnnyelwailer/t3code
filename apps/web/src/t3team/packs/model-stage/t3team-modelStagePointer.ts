/**
 * Where the pointer is relative to a stage's head, for look-at. One window listener per stage
 * that asks for it; the canvas reads the latest value each frame (no React re-render per move).
 */
import { useEffect, useState } from "react";

export interface StagePointer {
  /** CSS px from the head (the stage's horizontal centre, 30 % down). */
  dx: number;
  dy: number;
  /** False until the pointer has moved, and after it leaves the window. */
  present: boolean;
  /** Set by the scene: wakes its frame loop when the pointer moves. */
  onMove: (() => void) | null;
}

const HEAD_Y = 0.3;

export function useStagePointer(element: HTMLElement | null, enabled: boolean): StagePointer {
  const [pointer] = useState<StagePointer>(() => ({ dx: 0, dy: 0, present: false, onMove: null }));
  useEffect(() => {
    if (!enabled || element === null) return;
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.dx = event.clientX - (rect.left + rect.width / 2);
      pointer.dy = event.clientY - (rect.top + rect.height * HEAD_Y);
      pointer.present = true;
      pointer.onMove?.();
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      pointer.present = false;
      pointer.onMove?.();
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      pointer.present = false;
    };
  }, [element, enabled, pointer]);
  return pointer;
}
