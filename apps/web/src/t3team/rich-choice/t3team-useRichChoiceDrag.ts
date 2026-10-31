import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { resolveRichChoiceSwipe } from "./t3team-richChoice.logic";

/** Pixels a pointer must travel before a press becomes a drag (and a click is swallowed). */
const DRAG_START_PX = 6;

/**
 * Pointer drag for the carousel viewport: touch, pen and mouse. Returns the live offset to apply
 * to the track and the handlers to spread on the viewport. A finished drag turns the page through
 * `onSettle` and swallows the click that follows, so swiping can never choose or peek-select.
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
  const drag = useRef<{ startX: number; id: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const finish = () => {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (!current?.moved) return;
    swallowClick.current = true;
    onSettle(resolveRichChoiceSwipe(dragX, cardWidth(), frontIndex, count));
    setDragX(0);
  };

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag.current = { startX: event.clientX, id: event.pointerId, moved: false };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const delta = event.clientX - current.startX;
      if (!current.moved && Math.abs(delta) < DRAG_START_PX) return;
      if (!current.moved) {
        current.moved = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setDragX(delta);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClickCapture: (event: { stopPropagation(): void; preventDefault(): void }) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };

  return { dragX, dragging, handlers };
}
