import { describe, expect, it } from "vite-plus/test";

import {
  RICH_CHOICE_CARD_GAP,
  richChoiceCardWidth,
  richChoiceMotion,
  richChoiceTrackOffset,
} from "./t3team-richChoiceMotion";

describe("rich-choice motion", () => {
  it("springs and shrinks peeking cards by default", () => {
    expect(richChoiceMotion(false)).toMatchObject({ kind: "spring", peekScale: 0.94 });
  });

  it("is a plain short timing with no scale when motion is reduced", () => {
    expect(richChoiceMotion(true)).toEqual({
      kind: "timing",
      duration: 150,
      peekScale: 1,
      peekOpacity: 0.6,
    });
  });
});

describe("rich-choice geometry", () => {
  it("sizes a card to a share of a phone and caps it on a tablet", () => {
    expect(richChoiceCardWidth(360)).toBe(281);
    expect(richChoiceCardWidth(390)).toBe(304);
    expect(richChoiceCardWidth(1024)).toBe(480);
  });

  it("centres the front card and leaves its neighbours peeking on both sides", () => {
    const viewport = 390;
    const card = richChoiceCardWidth(viewport);
    const first = richChoiceTrackOffset(viewport, card, 0);
    const second = richChoiceTrackOffset(viewport, card, 1);
    expect(first).toBe((viewport - card) / 2);
    expect(first - second).toBe(card + RICH_CHOICE_CARD_GAP);
    // Some of the next card is visible beside the front card, and the card itself is not cut off.
    const peek = viewport - (first + card + RICH_CHOICE_CARD_GAP);
    expect(peek).toBeGreaterThan(20);
    expect(first).toBeGreaterThan(0);
  });
});
