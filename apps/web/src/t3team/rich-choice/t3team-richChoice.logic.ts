/**
 * Headless logic of the rich-choice carousel: which card is in front, how keys and drags move it,
 * and what a choice is. No React, no DOM, so the view and the tests share one definition.
 *
 * Swiping or arrowing only ever moves the front card; a choice is made by the explicit action.
 */

import type { ReactNode } from "react";

export interface RichChoiceOption {
  readonly id: string;
  readonly title: string;
  /** Short label above the title (a role badge, a category). */
  readonly tag?: string | undefined;
  /** Illustration; decorative when `alt` is empty. */
  readonly image?: { readonly src: string; readonly alt?: string | undefined } | undefined;
  /** Stand-in visual (an icon) when there is no illustration. */
  readonly visual?: ReactNode | undefined;
  /** Markdown-ish body; the view renders it through `renderBody` (plain paragraphs by default). */
  readonly body: string;
  /** Metadata chips ("what this changes"). */
  readonly chips?: readonly string[] | undefined;
}

export type RichChoiceNavKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

/** Movement past the first or last card clamps; a carousel with a hard start/end is easier to read. */
export function clampRichChoiceIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

export function resolveRichChoiceKey(
  key: string,
  current: number,
  count: number,
  rtl = false,
): number | null {
  switch (key) {
    case "ArrowRight":
      return clampRichChoiceIndex(current + (rtl ? -1 : 1), count);
    case "ArrowLeft":
      return clampRichChoiceIndex(current + (rtl ? 1 : -1), count);
    case "Home":
      return 0;
    case "End":
      return clampRichChoiceIndex(count - 1, count);
    default:
      return null;
  }
}

/** Fraction of the card width a drag must cover to turn the page, with a floor for tiny cards. */
const SWIPE_FRACTION = 0.18;
const SWIPE_MIN_PX = 36;

/**
 * Where a finished drag lands. `dragX` is negative when dragging left (towards the next card).
 * Moves one card at a time, never past either end.
 */
export function resolveRichChoiceSwipe(
  dragX: number,
  cardWidth: number,
  current: number,
  count: number,
  rtl = false,
): number {
  const threshold = Math.max(SWIPE_MIN_PX, cardWidth * SWIPE_FRACTION);
  if (Math.abs(dragX) < threshold) return current;
  const towardsNext = rtl ? dragX > 0 : dragX < 0;
  return clampRichChoiceIndex(current + (towardsNext ? 1 : -1), count);
}

/** Initial front card: the default option when it exists, else the first. */
export function resolveRichChoiceInitialIndex(
  options: readonly RichChoiceOption[],
  defaultId: string | undefined,
): number {
  const found = defaultId === undefined ? -1 : options.findIndex((o) => o.id === defaultId);
  return found < 0 ? 0 : found;
}

export function toggleRichChoiceSelection(
  selected: readonly string[],
  id: string,
  multiple: boolean,
): readonly string[] {
  if (!multiple) return [id];
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

/** Screen-reader label for a card: position, then title. */
export function describeRichChoicePosition(index: number, count: number, title: string): string {
  return `${index + 1} of ${count}: ${title}`;
}

/** Paragraphs of a body: blank-line separated, trimmed, empties dropped. */
export function splitRichChoiceBody(body: string): readonly string[] {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
