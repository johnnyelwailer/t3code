import { T3TeamQuickStartsSection } from "~/t3team/t3team-QuickStartsSection";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export type T3TeamSidecarSectionComponent = (props: {
  host: SidecarSectionHost;
  props?: unknown;
}) => React.ReactNode;

const SIDECAR_SECTION_COMPONENTS: Record<string, T3TeamSidecarSectionComponent> = {
  "quick-starts": T3TeamQuickStartsSection,
};

export function getT3TeamSidecarSectionComponent(
  component: string,
): T3TeamSidecarSectionComponent | undefined {
  return SIDECAR_SECTION_COMPONENTS[component];
}
