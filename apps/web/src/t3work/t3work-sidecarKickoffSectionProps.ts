import { getBundledSidecarSection } from "@t3tools/t3work-skill-packs";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";
import type { ProjectThread } from "~/t3work/t3work-types";

const LEGACY_SECTION_TOPIC: Readonly<Record<string, string>> = {
  "quick-starts": "quick-actions",
  "recent-conversations": "recent",
};

export function resolveT3workKickoffSectionProps(input: {
  readonly sectionId: string;
  readonly recipeInput: T3workSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly selectedRecipeId?: string | undefined;
  readonly recentThreads?: ReadonlyArray<ProjectThread> | undefined;
  readonly recentEmptyMessage?: string | undefined;
  readonly recentShowSearch?: boolean | undefined;
  readonly recentShowCount?: boolean | undefined;
}): unknown {
  const definition = getBundledSidecarSection(input.sectionId);
  if (!definition) {
    const legacyTopic = LEGACY_SECTION_TOPIC[input.sectionId];
    if (legacyTopic === "recent") {
      return {
        threads: input.recentThreads ?? [],
        ...(input.recentEmptyMessage ? { emptyMessage: input.recentEmptyMessage } : {}),
        ...(input.recentShowSearch !== undefined ? { showSearch: input.recentShowSearch } : {}),
        ...(input.recentShowCount !== undefined ? { showCount: input.recentShowCount } : {}),
      };
    }
    if (legacyTopic) {
      return {
        recipeInput: input.recipeInput,
        topic: legacyTopic,
        ...(input.selectedRecipeId ? { selectedRecipeId: input.selectedRecipeId } : {}),
      };
    }
    return undefined;
  }

  if (definition.component === "recent-conversations") {
    return {
      threads: input.recentThreads ?? [],
      ...(input.recentEmptyMessage ? { emptyMessage: input.recentEmptyMessage } : {}),
      ...(input.recentShowSearch !== undefined ? { showSearch: input.recentShowSearch } : {}),
      ...(input.recentShowCount !== undefined ? { showCount: input.recentShowCount } : {}),
    };
  }

  if (definition.component === "inline-filters" || definition.component === "recipe-list") {
    return {
      recipeInput: input.recipeInput,
      topic: definition.id,
      ...(input.selectedRecipeId ? { selectedRecipeId: input.selectedRecipeId } : {}),
    };
  }

  return undefined;
}
