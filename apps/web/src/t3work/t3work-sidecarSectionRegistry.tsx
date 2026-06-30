import {
  T3workInlineFiltersSection,
  resolveInlineFiltersSectionIsEmpty,
} from "~/t3work/t3work-InlineFiltersSection";
import {
  T3workRecentConversationsSection,
  resolveRecentConversationsSectionIsEmpty,
} from "~/t3work/t3work-RecentConversationsSection";
import {
  T3workRecipeListSection,
  resolveRecipeListSectionIsEmpty,
} from "~/t3work/t3work-RecipeListSection";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";

export type T3workSidecarSectionComponent = (props: {
  host: SidecarSectionHost;
  props?: unknown;
}) => React.ReactNode;

type T3workSidecarSectionRegistryEntry = {
  readonly Component: T3workSidecarSectionComponent;
  readonly resolveIsEmpty?: (props: unknown) => boolean;
};

const SIDECAR_SECTION_COMPONENTS: Record<string, T3workSidecarSectionRegistryEntry> = {
  "recipe-list": {
    Component: T3workRecipeListSection,
    resolveIsEmpty: resolveRecipeListSectionIsEmpty,
  },
  "inline-filters": {
    Component: T3workInlineFiltersSection,
    resolveIsEmpty: resolveInlineFiltersSectionIsEmpty,
  },
  "recent-conversations": {
    Component: T3workRecentConversationsSection,
    resolveIsEmpty: resolveRecentConversationsSectionIsEmpty,
  },
  // Legacy component keys kept for stored personalization overrides.
  "quick-starts": {
    Component: T3workRecipeListSection,
    resolveIsEmpty: resolveRecipeListSectionIsEmpty,
  },
};

export function getT3workSidecarSectionComponent(
  component: string,
): T3workSidecarSectionComponent | undefined {
  return SIDECAR_SECTION_COMPONENTS[component]?.Component;
}

export function resolveT3workSidecarSectionIsEmpty(
  component: string,
  props: unknown,
): boolean | undefined {
  return SIDECAR_SECTION_COMPONENTS[component]?.resolveIsEmpty?.(props);
}
