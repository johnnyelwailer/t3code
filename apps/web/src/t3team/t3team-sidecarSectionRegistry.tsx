/**
 * The `sidecar.section` slot. The bundled sections (`@t3tools/t3team-skill-packs`) are registered
 * into the app's view registry as host views, keyed by section id, next to the sections packs
 * register with their own definition. A composition names section ids; the sidecar resolves each
 * here, so a section is a view of the registry like any other.
 */
import { listBundledSidecarSections } from "@t3tools/t3team-skill-packs";
import type { SidecarSectionDefinition } from "@t3tools/project-recipes";

import { appViewRegistry } from "~/t3team/packs/t3team-appViewRegistry";
import type { SidecarSectionEntry } from "~/t3team/packs/t3team-viewRegistry";
import { T3TeamQuickStartsSection } from "~/t3team/t3team-QuickStartsSection";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export type T3TeamSidecarSectionComponent = (props: {
  host: SidecarSectionHost;
  props?: unknown;
}) => React.ReactNode;

/** Keyed by a bundled definition's `component`; read lazily, see `t3team-appViewRegistry.ts`. */
const BUNDLED_SECTION_COMPONENTS: Record<string, T3TeamSidecarSectionComponent> = {
  "quick-starts": T3TeamQuickStartsSection,
};

/** The bundled sections as host views of the `sidecar.section` slot. */
export function hostSidecarSectionViews(): ReadonlyArray<SidecarSectionEntry> {
  return listBundledSidecarSections().flatMap((definition) => {
    const component = BUNDLED_SECTION_COMPONENTS[definition.component];
    return component
      ? [
          {
            slot: "sidecar.section" as const,
            id: definition.id,
            owner: { kind: "host" as const },
            definition,
            component,
          },
        ]
      : [];
  });
}

/** Every registered section's definition, host sections first. */
export function listT3TeamSidecarSections(): ReadonlyArray<SidecarSectionDefinition> {
  return appViewRegistry()
    .list("sidecar.section")
    .map((entry) => entry.definition);
}

export function getT3TeamSidecarSectionEntry(sectionId: string): SidecarSectionEntry | undefined {
  return appViewRegistry().get("sidecar.section", sectionId);
}

export function getT3TeamSidecarSectionComponent(
  sectionId: string,
): T3TeamSidecarSectionComponent | undefined {
  return getT3TeamSidecarSectionEntry(sectionId)?.component;
}
