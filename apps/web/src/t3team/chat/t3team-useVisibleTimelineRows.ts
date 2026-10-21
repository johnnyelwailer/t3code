import { useState } from "react";

import type { ChatMessage } from "~/types";
import {
  isT3TeamTimelineRowVisible,
  type T3TeamTimelineRowsState,
} from "~/t3team/chat/t3team-timelineRows";

/**
 * The timeline's rows minus the ones the fork hides (a decision card's answered reply). The list
 * keeps its identity while the same rows survive: `useStableRows` adjusts state whenever the list
 * it is handed changes identity, so a filter that returned a fresh array on every pass would make
 * it re-render without end.
 */
export function useVisibleTimelineRows<
  Row extends { readonly kind: string; readonly message?: ChatMessage },
>(rows: Row[], t3teamRows: T3TeamTimelineRowsState): Row[] {
  const visible = rows.filter((row) => isT3TeamTimelineRowVisible(row, t3teamRows));
  const [previous, setPrevious] = useState(visible);
  if (
    previous.length === visible.length &&
    previous.every((row, index) => row === visible[index])
  ) {
    return previous;
  }
  setPrevious(visible);
  return visible;
}
