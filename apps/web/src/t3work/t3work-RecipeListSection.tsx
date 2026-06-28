import type { BackendApi } from "~/t3work/backend/t3work-types";
import { T3workKickoffRecipeList } from "~/t3work/t3work-KickoffRecipeList";
import {
  buildT3workSidecarRecipeQuickStarts,
  useT3workSidecarRecipeQuickStarts,
} from "~/t3work/t3work-sidecarRecipes";
import { filterT3workSidecarRecipesByTopic } from "~/t3work/t3work-sidecarRecipeTopics";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";
import {
  orderT3workSidecarSectionItems,
  type T3workSidecarSectionShellProps,
} from "~/t3work/t3work-sidecarSectionShellProps";
import type { SidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";

export type RecipeListSectionProps = {
  readonly recipeInput: T3workSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly topic: string;
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3workSidecarSectionShellProps<T3workSidecarRecipeQuickStart> | undefined;
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
    filterT3workSidecarRecipesByTopic(
      buildT3workSidecarRecipeQuickStarts(sectionProps.recipeInput),
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
  const quickStarts = useT3workSidecarRecipeQuickStarts(sectionProps.recipeInput);
  const topicQuickStarts = filterT3workSidecarRecipesByTopic(quickStarts, sectionProps.topic);
  const orderedQuickStarts = orderT3workSidecarSectionItems({
    items: topicQuickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  if (orderedQuickStarts.length === 0) {
    return null;
  }

  return (
    <T3workKickoffRecipeList
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

export function T3workRecipeListSection({
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
export const T3workQuickStartsSection = T3workRecipeListSection;
