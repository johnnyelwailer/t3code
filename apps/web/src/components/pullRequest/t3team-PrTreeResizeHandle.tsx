import type { KeyboardEventHandler, PointerEventHandler } from "react";

import { cn } from "~/lib/utils";

import { PR_TREE_MIN_WIDTH, type PrTreeDockSide } from "./t3team-prCodeTreeDock.logic";

export interface PrTreeResizeHandleProps {
  /** The side the tree is docked on; the handle hugs the edge facing the diff. */
  readonly side: PrTreeDockSide;
  readonly width: number;
  readonly onPointerDown: PointerEventHandler<HTMLElement>;
  readonly onPointerMove: PointerEventHandler<HTMLElement>;
  readonly onPointerUp: PointerEventHandler<HTMLElement>;
  readonly onPointerCancel: PointerEventHandler<HTMLElement>;
  readonly onKeyDown: KeyboardEventHandler<HTMLElement>;
  readonly onReset: () => void;
}

/** The draggable edge of the file tree. Arrow keys resize it; a double press restores the default. */
export function PrTreeResizeHandle({ side, width, onReset, ...handlers }: PrTreeResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      aria-valuenow={Math.round(width)}
      aria-valuemin={PR_TREE_MIN_WIDTH}
      tabIndex={0}
      onDoubleClick={onReset}
      className={cn(
        "absolute inset-y-0 z-30 w-1.5 cursor-col-resize touch-none outline-none transition-colors",
        "hover:bg-primary/30 focus-visible:bg-primary/40 active:bg-primary/40",
        side === "right" ? "left-0" : "right-0",
      )}
      {...handlers}
    />
  );
}
