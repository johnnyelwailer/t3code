import type { T3TeamProjectSetupCardOption } from "~/t3team/t3team-projectSetupProfileCatalog";

import type { RichChoiceOption } from "./t3team-richChoice.logic";

/** The role / working-style catalog as rich-choice options (Settings picker, setup thread, stories). */
export function toProfileRichChoiceOptions(
  cards: readonly T3TeamProjectSetupCardOption[],
): readonly RichChoiceOption[] {
  return cards.map((card) => {
    const Icon = card.icon;
    return {
      id: card.id,
      title: card.title,
      tag: card.eyebrow,
      image: card.iconSrc ? { src: card.iconSrc } : undefined,
      visual: card.iconSrc ? undefined : <Icon aria-hidden />,
      body: card.description,
      chips: card.chips,
    };
  });
}
