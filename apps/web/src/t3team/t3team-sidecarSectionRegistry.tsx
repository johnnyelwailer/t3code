import {
  T3TeamInlineFiltersSection,
  resolveInlineFiltersSectionIsEmpty,
} from "~/t3team/t3team-InlineFiltersSection";
import {
  T3TeamRecentConversationsSection,
  resolveRecentConversationsSectionIsEmpty,
} from "~/t3team/t3team-RecentConversationsSection";
import {
  T3TeamRecipeListSection,
  resolveRecipeListSectionIsEmpty,
} from "~/t3team/t3team-RecipeListSection";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export type T3TeamSidecarSectionComponent = (props: {
  host: SidecarSectionHost;
  props?: unknown;
}) => React.ReactNode;

type T3TeamSidecarSectionRegistryEntry = {
  readonly Component: T3TeamSidecarSectionComponent;
  readonly resolveIsEmpty?: (props: unknown) => boolean;
};

const SIDECAR_SECTION_COMPONENTS: Record<string, T3TeamSidecarSectionRegistryEntry> = {
  "recipe-list": {
    Component: T3TeamRecipeListSection,
    resolveIsEmpty: resolveRecipeListSectionIsEmpty,
  },
  "inline-filters": {
    Component: T3TeamInlineFiltersSection,
    resolveIsEmpty: resolveInlineFiltersSectionIsEmpty,
  },
  "recent-conversations": {
    Component: T3TeamRecentConversationsSection,
    resolveIsEmpty: resolveRecentConversationsSectionIsEmpty,
  },
  // Legacy component keys kept for stored personalization overrides.
  "quick-starts": {
    Component: T3TeamRecipeListSection,
    resolveIsEmpty: resolveRecipeListSectionIsEmpty,
  },
};

export function getT3TeamSidecarSectionComponent(
  component: string,
): T3TeamSidecarSectionComponent | undefined {
  return SIDECAR_SECTION_COMPONENTS[component]?.Component;
}

export function resolveT3TeamSidecarSectionIsEmpty(
  component: string,
  props: unknown,
): boolean | undefined {
  return SIDECAR_SECTION_COMPONENTS[component]?.resolveIsEmpty?.(props);
}
