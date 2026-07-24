import { useMemo, type ReactNode } from "react";
import {
  resolveSidecarComposition,
  type RecipeSurface,
  type SidecarComposition,
} from "@t3tools/project-recipes";
import {
  DEFAULT_SIDECAR_COMPOSITION,
  getT3TeamProfile,
  listBundledSidecarSections,
} from "@t3tools/t3team-skill-packs";

import { useT3TeamSidecarComposition } from "~/t3team/hooks/t3team-useSidecarComposition";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";
import { useRunT3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";
import { T3TeamSidecarSectionInstance } from "~/t3team/t3team-sidecarSectionInstance";

type T3TeamSidecarCompositionProps = {
  readonly surface: RecipeSurface;
  readonly profileId?: string | undefined;
  readonly projectDefault?: SidecarComposition | undefined;
  readonly host: SidecarSectionHost;
  readonly resolveSectionProps?: ((sectionId: string) => unknown) | undefined;
  readonly emptyState?: ReactNode;
};

export function T3TeamSidecarComposition({
  surface,
  profileId,
  projectDefault,
  host,
  resolveSectionProps,
  emptyState,
}: T3TeamSidecarCompositionProps) {
  const profileDefault = getT3TeamProfile(profileId).sidecarSections;
  const bundledSectionsById = useMemo(
    () => new Map(listBundledSidecarSections().map((section) => [section.id, section])),
    [],
  );
  const defaultComposition = useMemo(
    () =>
      resolveSidecarComposition({
        bundledDefault: DEFAULT_SIDECAR_COMPOSITION,
        profileDefault,
        projectDefault,
      }),
    [profileDefault, projectDefault],
  );
  const runWorkflowLaunch = useRunT3TeamDeterministicWorkflowLaunch();
  const {
    composition,
    setCollapsed,
    personalization,
    hideSection,
    moveSection,
    hideItem,
    pinItem,
    unpinItem,
  } = useT3TeamSidecarComposition({
    bundledDefault: DEFAULT_SIDECAR_COMPOSITION,
    profileDefault,
    projectDefault,
  });

  const visibleSections = composition.sections.flatMap((sectionState) => {
    const definition = bundledSectionsById.get(sectionState.sectionId);
    if (!definition || !definition.surfaces.includes(surface)) {
      return [];
    }

    return [{ definition, sectionState }];
  });

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {visibleSections.length === 0
        ? (emptyState ?? (
            <p className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground/70">
              No sidecar sections are available for this view.
            </p>
          ))
        : visibleSections.map(({ definition, sectionState }, index) => {
            return (
              <T3TeamSidecarSectionInstance
                key={definition.id}
                definition={definition}
                sectionState={sectionState}
                sectionIndex={index}
                totalVisibleSections={visibleSections.length}
                surface={surface}
                host={host}
                defaultComposition={defaultComposition}
                personalization={personalization}
                resolveSectionProps={resolveSectionProps}
                runWorkflowLaunch={runWorkflowLaunch}
                setCollapsed={setCollapsed}
                hideSection={hideSection}
                moveSection={moveSection}
                hideItem={hideItem}
                pinItem={pinItem}
                unpinItem={unpinItem}
              />
            );
          })}
    </div>
  );
}
