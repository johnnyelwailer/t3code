/** Widest a card gets on a tablet; on a phone a card is a share of the width. */
const CARD_MAX_WIDTH = 480;
const CARD_WIDTH_FRACTION = 0.78;
export const RICH_CHOICE_CARD_GAP = 12;

/** Card width for a carousel viewport: one card in full, its neighbours peeking out each side. */
export function richChoiceCardWidth(viewportWidth: number): number {
  return Math.min(Math.round(viewportWidth * CARD_WIDTH_FRACTION), CARD_MAX_WIDTH);
}

/** Track offset that puts the card at `frontIndex` in the middle of the viewport. */
export function richChoiceTrackOffset(
  viewportWidth: number,
  cardWidth: number,
  frontIndex: number,
): number {
  return (viewportWidth - cardWidth) / 2 - frontIndex * (cardWidth + RICH_CHOICE_CARD_GAP);
}

export type RichChoiceMotion =
  | { readonly kind: "spring"; readonly peekScale: number; readonly peekOpacity: number }
  | {
      readonly kind: "timing";
      readonly duration: number;
      readonly peekScale: 1;
      readonly peekOpacity: number;
    };

/**
 * How cards move. Reduced motion is a plain short linear timing with no spring and no scale
 * change on the peeking cards; otherwise the track springs and peeking cards sit slightly smaller.
 */
export function richChoiceMotion(reduceMotion: boolean): RichChoiceMotion {
  return reduceMotion
    ? { kind: "timing", duration: 150, peekScale: 1, peekOpacity: 0.6 }
    : { kind: "spring", peekScale: 0.94, peekOpacity: 0.6 };
}

export const RICH_CHOICE_SPRING = { damping: 24, stiffness: 240, mass: 1 } as const;
