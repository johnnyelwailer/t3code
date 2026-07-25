import type { SidecarComposition, SidecarPersonalization } from "@t3tools/project-recipes";

const EMPTY_SIDECAR_COMPOSITION: SidecarComposition = { sections: [] };

type SidecarCompositionSection = SidecarComposition["sections"][number];

export function resolveStoredComposition(
  personalization: SidecarPersonalization,
  fallbackComposition: SidecarComposition,
): SidecarComposition {
  return personalization.composition?.sections.length
    ? personalization.composition
    : fallbackComposition.sections.length
      ? fallbackComposition
      : EMPTY_SIDECAR_COMPOSITION;
}

export function appendUniqueItem(
  itemIds: ReadonlyArray<string> | undefined,
  itemId: string,
): ReadonlyArray<string> {
  return [...(itemIds ?? []).filter((candidate) => candidate !== itemId), itemId];
}

export function removeItem(
  itemIds: ReadonlyArray<string> | undefined,
  itemId: string,
): ReadonlyArray<string> | undefined {
  const nextItemIds = (itemIds ?? []).filter((candidate) => candidate !== itemId);
  return nextItemIds.length > 0 ? nextItemIds : undefined;
}

export function updateSectionItemMap(
  itemMap: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
  sectionId: string,
  nextItemIds: ReadonlyArray<string> | undefined,
): Readonly<Record<string, ReadonlyArray<string>>> | undefined {
  const nextItemMap = { ...itemMap };

  if (!nextItemIds || nextItemIds.length === 0) {
    delete nextItemMap[sectionId];
  } else {
    nextItemMap[sectionId] = nextItemIds;
  }

  return Object.keys(nextItemMap).length > 0 ? nextItemMap : undefined;
}

export function updateSectionState(
  sections: ReadonlyArray<SidecarCompositionSection>,
  sectionId: string,
  patch: Partial<SidecarCompositionSection>,
): ReadonlyArray<SidecarCompositionSection> {
  return sections.some((section) => section.sectionId === sectionId)
    ? sections.map((section) =>
        section.sectionId === sectionId ? { ...section, ...patch } : section,
      )
    : [...sections, { sectionId, ...patch }];
}
