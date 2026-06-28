import { getBundledT3WorkRecipe } from "@t3tools/t3work-skill-packs";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  resolveT3workDashboardRecipeAction,
  useRunT3workDashboardRecipeAction,
} from "~/t3work/t3work-dashboardRecipeActions";
import { T3workFilterActionCard } from "~/t3work/t3work-FilterActionCard";
import { useRunT3workDeterministicWorkflowLaunch } from "~/t3work/t3work-inlineRecipeLaunch";
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

function supportsFilterRankNext(recipeId: string): boolean {
  return recipeId === "focus-needs-my-action";
}

export type InlineFiltersSectionProps = {
  readonly recipeInput: T3workSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly topic?: string | undefined;
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3workSidecarSectionShellProps<T3workSidecarRecipeQuickStart> | undefined;
};

function isInlineFiltersSectionProps(props: unknown): props is InlineFiltersSectionProps {
  return typeof props === "object" && props !== null && "recipeInput" in props;
}

export function resolveInlineFiltersSectionIsEmpty(props: unknown): boolean {
  if (!isInlineFiltersSectionProps(props)) {
    return true;
  }

  const topic = props.topic ?? "filters";
  return (
    filterT3workSidecarRecipesByTopic(buildT3workSidecarRecipeQuickStarts(props.recipeInput), topic)
      .length === 0
  );
}

function InlineFiltersSectionContent({
  host,
  sectionProps,
}: {
  host: SidecarSectionHost;
  sectionProps: InlineFiltersSectionProps;
}) {
  const topic = sectionProps.topic ?? "filters";
  const runDashboardRecipeAction = useRunT3workDashboardRecipeAction();
  const runWorkflowLaunch = useRunT3workDeterministicWorkflowLaunch();
  const quickStarts = useT3workSidecarRecipeQuickStarts(sectionProps.recipeInput);
  const filterQuickStarts = filterT3workSidecarRecipesByTopic(quickStarts, topic);
  const orderedQuickStarts = orderT3workSidecarSectionItems({
    items: filterQuickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  if (orderedQuickStarts.length === 0) {
    return null;
  }

  const applyFilterRecipe = (recipe: T3workSidecarRecipeQuickStart) => {
    const dashboardAction = resolveT3workDashboardRecipeAction(recipe.id);
    if (dashboardAction) {
      runDashboardRecipeAction(dashboardAction);
      return;
    }

    const bundledRecipe = getBundledT3WorkRecipe(recipe.id);
    if (!bundledRecipe?.kickoff || !recipe.workflow) {
      return;
    }

    void runWorkflowLaunch({
      launchId: bundledRecipe.id,
      title: bundledRecipe.title,
      description: bundledRecipe.shortDescription,
      surface: recipe.workflow.surface,
      workflow: bundledRecipe.kickoff,
      allowedToolGroups: bundledRecipe.allowedToolGroups,
      source: "bundled",
    });
  };

  const renderFilterCard = (recipe: T3workSidecarRecipeQuickStart) => {
    const card = (
      <T3workFilterActionCard
        recipe={recipe}
        isSelected={sectionProps.selectedRecipeId === recipe.id}
        onApply={() => applyFilterRecipe(recipe)}
        {...(supportsFilterRankNext(recipe.id)
          ? { onRankNext: () => host.stageKickoff(recipe) }
          : {})}
      />
    );

    return sectionProps.shell?.wrapItem ? sectionProps.shell.wrapItem(recipe, card) : card;
  };

  return <div className="space-y-2.5">{orderedQuickStarts.map(renderFilterCard)}</div>;
}

export function T3workInlineFiltersSection({
  host,
  props,
}: {
  host: SidecarSectionHost;
  props?: unknown;
}) {
  if (!isInlineFiltersSectionProps(props)) {
    return null;
  }

  return <InlineFiltersSectionContent host={host} sectionProps={props} />;
}
