import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { resolveRichChoiceSwipe } from "./t3team-richChoice.logic";

/** Pixels a pointer must travel before a press becomes a drag (and a click is swallowed). */
const DRAG_START_PX = 6;

interface Gesture {
  readonly startX: number;
  readonly startY: number;
  readonly id: number;
  moved: boolean;
}

/**
 * Pointer drag for the carousel viewport. A finished drag turns the page and swallows the click
 * after it; a cancelled or mostly vertical gesture changes nothing.
 */
export function useRichChoiceDrag(input: {
  readonly frontIndex: number;
  readonly count: number;
  readonly cardWidth: () => number;
  readonly onSettle: (index: number) => void;
}) {
  const { frontIndex, count, cardWidth, onSettle } = input;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  // Set only by a completed drag; cleared by the click it swallows, by the next press or key, and
  // by a cancel, so a later deliberate click is never lost.
  const swallowClick = useRef(false);

  const reset = () => {
    gesture.current = null;
    setDragging(false);
    setDragX(0);
  };

  const finish = () => {
    const current = gesture.current;
    const delta = dragX;
    reset();
    if (!current?.moved) return;
    swallowClick.current = true;
    onSettle(resolveRichChoiceSwipe(delta, cardWidth(), frontIndex, count));
  };

  const cancel = () => {
    swallowClick.current = false;
    reset();
  };

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      swallowClick.current = false;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        id: event.pointerId,
        moved: false,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const deltaX = event.clientX - current.startX;
      if (!current.moved) {
        const deltaY = event.clientY - current.startY;
        if (Math.abs(deltaY) >= DRAG_START_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
          gesture.current = null;
          return;
        }
        if (Math.abs(deltaX) < DRAG_START_PX) return;
        current.moved = true;
        setDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer is already gone; the drag still resolves on its own events.
        }
      }
      setDragX(deltaX);
    },
    onPointerUp: finish,
    onPointerCancel: cancel,
    onClickCapture: (event: { stopPropagation(): void; preventDefault(): void }) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };

  /** A key press ends any pending suppression: it can only mean a keyboard-driven click. */
  const clearSwallow = () => {
    swallowClick.current = false;
  };

  return { dragX, dragging, handlers, clearSwallow };
}
