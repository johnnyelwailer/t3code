/**
 * `ModelStage` as a control (`ModelStageInteraction`): click/tap/Enter/Space pokes it; a press
 * that moves more than a few pixels picks it up (when draggable). While held it follows the
 * pointer, clamped inside the nearest ancestor comfortably larger than the stage; on release it
 * falls back to its resting height, keeping the horizontal position where it was dropped.
 */
import type { ModelStageInteraction } from "@t3team/pack-ui/contract";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { clampDragOffset, type Box } from "./t3team-modelStageMath";

const DRAG_SLOP_PX = 5;
const FALL_MS = 420;

type Press = {
  id: number;
  startX: number;
  startY: number;
  base: { x: number; y: number };
  rest: Box;
  bounds: Box;
  moved: boolean;
};

const box = (rect: DOMRect | Box): Box => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

/** The nearest ancestor at least 2.5 × 1.6 stages big, else the viewport. */
export function stageDragBounds(element: HTMLElement, size: number): Box {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= size * 2.5 && rect.height >= size * 1.6) return box(rect);
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

export function useStageInteraction(
  element: HTMLElement | null,
  interaction: ModelStageInteraction | null | undefined,
  size: number,
  reducedMotion: boolean,
) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  const [falling, setFalling] = useState(false);
  const press = useRef<Press | null>(null);
  const landTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(landTimer.current), []);

  if (!interaction) return { props: {}, style: undefined, held: false };
  const { onPoke, draggable, onHeldChange, onKey } = interaction;

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (element === null || event.button !== 0) return;
    const rect = element.getBoundingClientRect();
    press.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: offset,
      rest: { ...box(rect), left: rect.left - offset.x, top: rect.top - offset.y },
      bounds: stageDragBounds(element, size),
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (!current || current.id !== event.pointerId || !draggable) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      current.moved = true;
      element?.setPointerCapture?.(event.pointerId);
      window.clearTimeout(landTimer.current);
      setFalling(false);
      setHeld(true);
      onHeldChange?.(true);
    }
    setOffset(
      clampDragOffset(
        { x: current.base.x + dx, y: current.base.y + dy },
        current.rest,
        current.bounds,
      ),
    );
  };
  const release = (poke: boolean) => {
    const current = press.current;
    press.current = null;
    if (!current) return;
    if (!current.moved) {
      if (poke) onPoke?.();
      return;
    }
    setHeld(false);
    setFalling(!reducedMotion);
    setOffset((value) => ({ x: value.x, y: 0 }));
    landTimer.current = window.setTimeout(
      () => {
        setFalling(false);
        onHeldChange?.(false);
      },
      reducedMotion ? 0 : FALL_MS,
    );
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPoke?.();
    } else onKey?.(event.key);
  };

  const style: CSSProperties = {
    transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
    transition: falling ? `transform ${FALL_MS}ms cubic-bezier(0.55, 0, 1, 0.45)` : undefined,
    cursor: draggable ? (held ? "grabbing" : "grab") : "pointer",
    touchAction: draggable ? "none" : undefined,
    zIndex: held || falling ? 20 : undefined,
  };
  return {
    props: {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": interaction.label,
      onPointerDown,
      onPointerMove,
      onPointerUp: () => release(true),
      onPointerCancel: () => release(false),
      onKeyDown,
    },
    style,
    held,
  };
}
