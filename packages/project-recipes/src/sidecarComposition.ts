import * as Schema from "effect/Schema";

export const SidecarCompositionSection = Schema.Struct({
  sectionId: Schema.String,
  visible: Schema.optional(Schema.Boolean),
  collapsed: Schema.optional(Schema.Boolean),
});
export type SidecarCompositionSection = typeof SidecarCompositionSection.Type;

export const SidecarComposition = Schema.Struct({
  sections: Schema.Array(SidecarCompositionSection),
});
export type SidecarComposition = typeof SidecarComposition.Type;

export const SidecarPersonalization = Schema.Struct({
  composition: Schema.optional(SidecarComposition),
});
export type SidecarPersonalization = typeof SidecarPersonalization.Type;

function normalizeSections(
  sections: ReadonlyArray<SidecarCompositionSection>,
): SidecarComposition["sections"] {
  const normalized = new Map<string, SidecarCompositionSection>();

  for (const section of sections) {
    if (normalized.has(section.sectionId)) {
      normalized.delete(section.sectionId);
    }
    normalized.set(section.sectionId, section);
  }

  return [...normalized.values()];
}

function applyCompositionLayer(
  base: SidecarComposition,
  override: SidecarComposition,
): SidecarComposition {
  const normalizedBase = normalizeSections(base.sections);
  const normalizedOverride = normalizeSections(override.sections);
  const baseMap = new Map(normalizedBase.map((section) => [section.sectionId, section]));
  const overrideMap = new Map(normalizedOverride.map((section) => [section.sectionId, section]));
  const orderedSectionIds = [
    ...normalizedOverride.map((section) => section.sectionId),
    ...normalizedBase
      .map((section) => section.sectionId)
      .filter((sectionId) => !overrideMap.has(sectionId)),
  ];

  return {
    sections: orderedSectionIds.map((sectionId) => {
      const baseSection = baseMap.get(sectionId);
      const overrideSection = overrideMap.get(sectionId);

      return {
        sectionId,
        ...(baseSection?.visible !== undefined ? { visible: baseSection.visible } : {}),
        ...(baseSection?.collapsed !== undefined ? { collapsed: baseSection.collapsed } : {}),
        ...(overrideSection?.visible !== undefined ? { visible: overrideSection.visible } : {}),
        ...(overrideSection?.collapsed !== undefined
          ? { collapsed: overrideSection.collapsed }
          : {}),
      };
    }),
  };
}

export function resolveSidecarComposition(input: {
  bundledDefault: SidecarComposition;
  profileDefault?: SidecarComposition | undefined;
  projectDefault?: SidecarComposition | undefined;
  userOverrides?: SidecarComposition | undefined;
}): SidecarComposition {
  const layeredComposition = [
    input.bundledDefault,
    input.profileDefault,
    input.projectDefault,
    input.userOverrides,
  ].reduce<SidecarComposition>(
    (current, nextLayer) => {
      if (!nextLayer) {
        return current;
      }

      return applyCompositionLayer(current, nextLayer);
    },
    { sections: [] },
  );

  return {
    sections: layeredComposition.sections.filter((section) => section.visible !== false),
  };
}
