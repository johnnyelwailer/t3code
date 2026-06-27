import type { SidecarComposition, SidecarPersonalization } from "@t3tools/project-recipes";

export type T3workSidecarResetPlan = {
  readonly nextPersonalization: SidecarPersonalization;
  readonly fieldRows: ReadonlyArray<Record<string, string>>;
  readonly promptText: string;
  readonly launchTitle: string;
  readonly cardTitle: string;
  readonly cardBody: string;
};

function removeSectionIds(
  itemMap: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
  sectionId: string,
) {
  if (!itemMap?.[sectionId]) {
    return itemMap;
  }
  const next = { ...itemMap };
  delete next[sectionId];
  return Object.keys(next).length > 0 ? next : undefined;
}

function removeItemId(
  itemMap: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
  sectionId: string,
  itemId: string,
) {
  const nextItemIds = (itemMap?.[sectionId] ?? []).filter((candidate) => candidate !== itemId);
  const next = { ...itemMap };
  if (nextItemIds.length > 0) {
    next[sectionId] = nextItemIds;
  } else {
    delete next[sectionId];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countSectionItems(
  itemMap: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
  sectionId: string,
) {
  return itemMap?.[sectionId]?.length ?? 0;
}

function sameComposition(a: SidecarComposition | undefined, b: SidecarComposition) {
  return JSON.stringify(a?.sections ?? []) === JSON.stringify(b.sections);
}

export function buildT3workSidecarSectionResetPlan(input: {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly defaultComposition: SidecarComposition;
  readonly personalization: SidecarPersonalization;
}) {
  const storedComposition = input.personalization.composition;
  const storedSections = storedComposition?.sections ?? [];
  const defaultSections = input.defaultComposition.sections;
  const storedIndex = storedSections.findIndex((section) => section.sectionId === input.sectionId);
  const defaultIndex = defaultSections.findIndex(
    (section) => section.sectionId === input.sectionId,
  );
  const storedSection = storedSections[storedIndex];
  const defaultSection = defaultSections[defaultIndex];
  const hiddenCount = countSectionItems(input.personalization.itemHides, input.sectionId);
  const pinnedCount = countSectionItems(input.personalization.itemPins, input.sectionId);
  const orderedCount = countSectionItems(input.personalization.itemOrderOverrides, input.sectionId);
  const hasOrderOverride = storedIndex >= 0 && defaultIndex >= 0 && storedIndex !== defaultIndex;
  const hasCollapseOverride =
    storedIndex >= 0 && defaultIndex >= 0 && storedSection?.collapsed !== defaultSection?.collapsed;
  const changeCount =
    (hasOrderOverride ? 1 : 0) +
    (hasCollapseOverride ? 1 : 0) +
    hiddenCount +
    pinnedCount +
    orderedCount;
  if (changeCount === 0) {
    return null;
  }

  const nextIds = storedSections
    .map((section) => section.sectionId)
    .filter((id) => id !== input.sectionId);
  if (storedIndex >= 0 && defaultIndex >= 0) {
    const defaultOrder = new Map(
      defaultSections.map((section, index) => [section.sectionId, index]),
    );
    const nextOrderedIds: string[] = [];
    let inserted = false;
    for (const id of nextIds) {
      if (!inserted && (defaultOrder.get(id) ?? Number.POSITIVE_INFINITY) > defaultIndex) {
        nextOrderedIds.push(input.sectionId);
        inserted = true;
      }
      nextOrderedIds.push(id);
    }
    if (!inserted) {
      nextOrderedIds.push(input.sectionId);
    }
    nextIds.splice(0, nextIds.length, ...nextOrderedIds);
  }

  const storedMap = new Map(storedSections.map((section) => [section.sectionId, section]));
  const nextComposition =
    storedComposition && defaultSection
      ? {
          sections: nextIds.map((sectionId) =>
            sectionId === input.sectionId ? defaultSection : storedMap.get(sectionId)!,
          ),
        }
      : undefined;
  const nextItemHides = removeSectionIds(input.personalization.itemHides, input.sectionId);
  const nextItemPins = removeSectionIds(input.personalization.itemPins, input.sectionId);
  const nextItemOrderOverrides = removeSectionIds(
    input.personalization.itemOrderOverrides,
    input.sectionId,
  );

  return {
    nextPersonalization: {
      ...(nextComposition && !sameComposition(nextComposition, input.defaultComposition)
        ? { composition: nextComposition }
        : {}),
      ...(nextItemHides ? { itemHides: nextItemHides } : {}),
      ...(nextItemPins ? { itemPins: nextItemPins } : {}),
      ...(nextItemOrderOverrides ? { itemOrderOverrides: nextItemOrderOverrides } : {}),
    } satisfies SidecarPersonalization,
    fieldRows: [
      ...(hasOrderOverride
        ? [{ change: "Section order", reset: "Restore default placement" }]
        : []),
      ...(hasCollapseOverride
        ? [
            {
              change: "Collapse state",
              reset: defaultSection?.collapsed ? "Collapsed" : "Expanded",
            },
          ]
        : []),
      ...(hiddenCount > 0
        ? [{ change: "Hidden items", reset: pluralize(hiddenCount, "item") }]
        : []),
      ...(pinnedCount > 0
        ? [{ change: "Pinned items", reset: pluralize(pinnedCount, "item") }]
        : []),
      ...(orderedCount > 0
        ? [{ change: "Manual item order", reset: pluralize(orderedCount, "override") }]
        : []),
    ],
    promptText: `Restored ${pluralize(changeCount, "customization")} in ${input.sectionTitle}.`,
    launchTitle: "Reset section",
    cardTitle: "Reset section customizations",
    cardBody: `This will restore ${pluralize(changeCount, "customization")} in ${input.sectionTitle} to its bundled or profile defaults.`,
  } satisfies T3workSidecarResetPlan;
}

export function buildT3workSidecarItemResetPlan(input: {
  readonly sectionId: string;
  readonly itemId: string;
  readonly itemTitle: string;
  readonly personalization: SidecarPersonalization;
}) {
  const hidden = (input.personalization.itemHides?.[input.sectionId] ?? []).includes(input.itemId);
  const pinned = (input.personalization.itemPins?.[input.sectionId] ?? []).includes(input.itemId);
  const ordered = (input.personalization.itemOrderOverrides?.[input.sectionId] ?? []).includes(
    input.itemId,
  );
  const changeCount = [hidden, pinned, ordered].filter(Boolean).length;
  if (changeCount === 0) {
    return null;
  }

  return {
    nextPersonalization: {
      ...(removeItemId(input.personalization.itemHides, input.sectionId, input.itemId)
        ? {
            itemHides: removeItemId(input.personalization.itemHides, input.sectionId, input.itemId),
          }
        : {}),
      ...(removeItemId(input.personalization.itemPins, input.sectionId, input.itemId)
        ? { itemPins: removeItemId(input.personalization.itemPins, input.sectionId, input.itemId) }
        : {}),
      ...(removeItemId(input.personalization.itemOrderOverrides, input.sectionId, input.itemId)
        ? {
            itemOrderOverrides: removeItemId(
              input.personalization.itemOrderOverrides,
              input.sectionId,
              input.itemId,
            ),
          }
        : {}),
      ...(input.personalization.composition
        ? { composition: input.personalization.composition }
        : {}),
    } satisfies SidecarPersonalization,
    fieldRows: [
      ...(hidden ? [{ change: "Hidden state", reset: "Show item again" }] : []),
      ...(pinned ? [{ change: "Pinned position", reset: "Return to natural order" }] : []),
      ...(ordered ? [{ change: "Manual order", reset: "Clear item-specific override" }] : []),
    ],
    promptText: `Restored ${pluralize(changeCount, "customization")} for ${input.itemTitle}.`,
    launchTitle: "Customize…",
    cardTitle: "Reset item overrides",
    cardBody: `This will restore ${pluralize(changeCount, "customization")} for ${input.itemTitle} to the default section behavior.`,
  } satisfies T3workSidecarResetPlan;
}
