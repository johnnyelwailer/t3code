import type { BackendApi } from "~/t3team/backend/t3team-types";
import { T3TeamKickoffRecipeList } from "~/t3team/t3team-KickoffRecipeList";
import {
  buildT3TeamSidecarRecipeQuickStarts,
  useT3TeamSidecarRecipeQuickStarts,
} from "~/t3team/t3team-sidecarRecipes";
import { filterT3TeamSidecarRecipesByTopic } from "~/t3team/t3team-sidecarRecipeTopics";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import {
  orderT3TeamSidecarSectionItems,
  type T3TeamSidecarSectionShellProps,
} from "~/t3team/t3team-sidecarSectionShellProps";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";

export type RecipeListSectionProps = {
  readonly recipeInput: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly topic: string;
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3TeamSidecarSectionShellProps<T3TeamSidecarRecipeQuickStart> | undefined;
};

function isRecipeListSectionProps(props: unknown): props is RecipeListSectionProps {
  return (
    typeof props === "object" &&
    props !== null &&
    "recipeInput" in props &&
    "topic" in props &&
    typeof (props as RecipeListSectionProps).topic === "string"
  );
}

function normalizeRecipeListSectionProps(props: unknown): RecipeListSectionProps | undefined {
  if (isRecipeListSectionProps(props)) {
    return props;
  }

  if (typeof props === "object" && props !== null && "recipeInput" in props) {
    return {
      ...(props as Omit<RecipeListSectionProps, "topic">),
      topic: "quick-actions",
    };
  }

  return undefined;
}

export function resolveRecipeListSectionIsEmpty(props: unknown): boolean {
  const sectionProps = normalizeRecipeListSectionProps(props);
  if (!sectionProps) {
    return true;
  }

  return (
    filterT3TeamSidecarRecipesByTopic(
      buildT3TeamSidecarRecipeQuickStarts(sectionProps.recipeInput),
      sectionProps.topic,
    ).length === 0
  );
}

function RecipeListSectionContent({
  host,
  sectionProps,
}: {
  host: SidecarSectionHost;
  sectionProps: RecipeListSectionProps;
}) {
  const quickStarts = useT3TeamSidecarRecipeQuickStarts(sectionProps.recipeInput);
  const topicQuickStarts = filterT3TeamSidecarRecipesByTopic(quickStarts, sectionProps.topic);
  const orderedQuickStarts = orderT3TeamSidecarSectionItems({
    items: topicQuickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  if (orderedQuickStarts.length === 0) {
    return null;
  }

  return (
    <T3TeamKickoffRecipeList
      recipes={orderedQuickStarts}
      {...(sectionProps.selectedRecipeId
        ? { selectedRecipeId: sectionProps.selectedRecipeId }
        : {})}
      onSelectRecipe={(recipe, customization) => host.stageKickoff(recipe, customization)}
      renderRecipe={
        sectionProps.shell?.wrapItem
          ? (recipe, content) => sectionProps.shell?.wrapItem?.(recipe, content) ?? content
          : undefined
      }
    />
  );
}

export function T3TeamRecipeListSection({
  host,
  props,
}: {
  host: SidecarSectionHost;
  props?: unknown;
}) {
  const sectionProps = normalizeRecipeListSectionProps(props);
  if (!sectionProps) {
    return null;
  }

  return <RecipeListSectionContent host={host} sectionProps={sectionProps} />;
}

// Backward-compatible alias while kickoff stories migrate off the old component name.
export const T3TeamQuickStartsSection = T3TeamRecipeListSection;
