import { useState } from "react";

import { T3TeamFilterActionCard } from "~/t3team/t3team-FilterActionCard";
import { T3TeamRecipeListCard } from "~/t3team/t3team-RecipeListCard";
import {
  sidecarStoryDefaultCompositionRecipes,
  sidecarStoryEngineeringCompositionRecipes,
  sidecarStoryQaCompositionRecipes,
} from "~/t3team/t3team-sidecarStoryFixtures";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import { T3TeamTopicSection } from "~/t3team/t3team-TopicSection";

type SidecarCompositionPreviewVariant = "default" | "engineering" | "qa";

type TopicSectionConfig = {
  readonly sectionId: string;
  readonly title: string;
  readonly kind: "filters" | "recipe-list";
  readonly recipeIds: ReadonlyArray<string>;
};

const COMPOSITION_SECTIONS: Record<SidecarCompositionPreviewVariant, ReadonlyArray<TopicSectionConfig>> =
  {
    default: [
      { sectionId: "filters", title: "Filters", kind: "filters", recipeIds: ["show-only-assigned-to-me", "focus-needs-my-action", "clear-filters"] },
      { sectionId: "quick-actions", title: "Quick actions", kind: "recipe-list", recipeIds: ["explain-selected-work"] },
      { sectionId: "refinement", title: "Refinement", kind: "recipe-list", recipeIds: ["tshirt-size-epic", "shape-next-backlog-slice"] },
    ],
    engineering: [
      { sectionId: "filters", title: "Filters", kind: "filters", recipeIds: ["show-only-assigned-to-me"] },
      { sectionId: "quick-actions", title: "Quick actions", kind: "recipe-list", recipeIds: ["explain-selected-work"] },
      { sectionId: "refinement", title: "Refinement", kind: "recipe-list", recipeIds: ["tshirt-size-epic", "shape-next-backlog-slice"] },
    ],
    qa: [
      { sectionId: "filters", title: "Filters", kind: "filters", recipeIds: ["show-only-assigned-to-me"] },
      { sectionId: "quick-actions", title: "Quick actions", kind: "recipe-list", recipeIds: ["explain-selected-work"] },
      { sectionId: "qa", title: "QA", kind: "recipe-list", recipeIds: ["review-acceptance-criteria"] },
    ],
  };

const RECIPES_BY_VARIANT: Record<
  SidecarCompositionPreviewVariant,
  ReadonlyArray<T3TeamSidecarRecipeQuickStart>
> = {
  default: sidecarStoryDefaultCompositionRecipes,
  engineering: sidecarStoryEngineeringCompositionRecipes,
  qa: sidecarStoryQaCompositionRecipes,
};

function renderRecipeCard(
  recipe: T3TeamSidecarRecipeQuickStart,
  kind: TopicSectionConfig["kind"],
  selectedRecipeId: string | undefined,
  onSelectRecipe: (recipeId: string) => void,
) {
  if (kind === "filters") {
    return (
      <T3TeamFilterActionCard
        key={recipe.id}
        recipe={recipe}
        isSelected={selectedRecipeId === recipe.id}
        onApply={() => onSelectRecipe(recipe.id)}
        {...(recipe.id === "focus-needs-my-action"
          ? { onRankNext: () => onSelectRecipe(`${recipe.id}:rank-next`) }
          : {})}
      />
    );
  }

  return (
    <T3TeamRecipeListCard
      key={recipe.id}
      recipe={recipe}
      isSelected={selectedRecipeId === recipe.id}
      onClick={() => onSelectRecipe(recipe.id)}
    />
  );
}

export function T3TeamSidecarCompositionPreview({
  variant = "default",
}: {
  readonly variant?: SidecarCompositionPreviewVariant;
}) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | undefined>();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const recipesById = new Map(
    RECIPES_BY_VARIANT[variant].map((recipe) => [recipe.id, recipe] as const),
  );

  return (
    <div className="mx-auto w-full max-w-sm space-y-5 bg-background p-4 text-foreground sm:p-5">
      {COMPOSITION_SECTIONS[variant].map((section) => {
        const sectionRecipes = section.recipeIds.flatMap((recipeId) => {
          const recipe = recipesById.get(recipeId);
          return recipe ? [recipe] : [];
        });

        return (
          <T3TeamTopicSection
            key={section.sectionId}
            sectionId={section.sectionId}
            title={section.title}
            collapsed={collapsedSections[section.sectionId] === true}
            onToggleCollapsed={() =>
              setCollapsedSections((current) => ({
                ...current,
                [section.sectionId]: !current[section.sectionId],
              }))
            }
          >
            {sectionRecipes.map((recipe) =>
              renderRecipeCard(recipe, section.kind, selectedRecipeId, setSelectedRecipeId),
            )}
          </T3TeamTopicSection>
        );
      })}
    </div>
  );
}
