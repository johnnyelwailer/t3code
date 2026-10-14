import * as Schema from "effect/Schema";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import {
  PR_TREE_DEFAULT_WIDTH,
  clampPrTreeWidth,
  oppositeDockSide,
  prTreeKeyboardDelta,
  prTreeWidthAfterDrag,
  type PrTreeDockSide,
} from "./t3team-prCodeTreeDock.logic";

const SIDE_STORAGE_KEY = "t3code.pullRequestFileTreeSide";
const WIDTH_STORAGE_KEY = "t3code.pullRequestFileTreeWidth";

// Stable codec identities, so the storage hooks keep a referentially stable schema.
const SIDE_SCHEMA = Schema.Literals(["left", "right"]);
const WIDTH_SCHEMA = Schema.Finite;

/** The row the tree and the diff share, which the handle measures to know how far it may go. */
const TREE_ROW_SELECTOR = "[data-pr-tree-row]";

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly rowWidth: number;
}

function rowWidthOf(handle: HTMLElement): number {
  const row = handle.closest(TREE_ROW_SELECTOR);
  return row?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY;
}

/**
 * The reader's choice of side and width for the Code tab's file tree, kept per browser. A drag
 * moves a local width and writes it once on release, so the diff beside it is not asked to
 * re-render storage on every pointer move.
 */
export function usePrTreeDock() {
  const [side, setSide] = useLocalStorage<PrTreeDockSide, PrTreeDockSide>(
    SIDE_STORAGE_KEY,
    "right",
    SIDE_SCHEMA,
  );
  const [storedWidth, setStoredWidth] = useLocalStorage(
    WIDTH_STORAGE_KEY,
    PR_TREE_DEFAULT_WIDTH,
    WIDTH_SCHEMA,
  );
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const width = dragWidth ?? storedWidth;

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
        rowWidth: rowWidthOf(event.currentTarget),
      };
      setDragWidth(width);
    },
    [width],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const active = drag.current;
      if (active === null || active.pointerId !== event.pointerId) return;
      setDragWidth(
        prTreeWidthAfterDrag({
          startWidth: active.startWidth,
          deltaX: event.clientX - active.startX,
          side,
          rowWidth: active.rowWidth,
        }),
      );
    },
    [side],
  );
  const endDrag = useCallback(
    (event: PointerEvent<HTMLElement>, commit: boolean) => {
      const active = drag.current;
      if (active === null || active.pointerId !== event.pointerId) return;
      drag.current = null;
      if (commit) {
        setStoredWidth(
          prTreeWidthAfterDrag({
            startWidth: active.startWidth,
            deltaX: event.clientX - active.startX,
            side,
            rowWidth: active.rowWidth,
          }),
        );
      }
      setDragWidth(null);
    },
    [setStoredWidth, side],
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const delta = prTreeKeyboardDelta(event.key, side);
      if (delta === 0) return;
      event.preventDefault();
      setStoredWidth(clampPrTreeWidth(width + delta, rowWidthOf(event.currentTarget)));
    },
    [setStoredWidth, side, width],
  );

  return {
    side,
    width,
    swapSide: () => setSide(oppositeDockSide(side)),
    resetWidth: () => setStoredWidth(PR_TREE_DEFAULT_WIDTH),
    resizeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLElement>) => endDrag(event, true),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => endDrag(event, false),
      onKeyDown,
    },
  };
}
