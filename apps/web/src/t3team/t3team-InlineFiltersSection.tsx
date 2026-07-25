import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  resolveT3TeamDashboardRecipeAction,
  useRunT3TeamDashboardRecipeAction,
} from "~/t3team/t3team-dashboardRecipeActions";
import { T3TeamFilterActionCard } from "~/t3team/t3team-FilterActionCard";
import { useRunT3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";
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

function supportsFilterRankNext(recipeId: string): boolean {
  return recipeId === "focus-needs-my-action";
}

export type InlineFiltersSectionProps = {
  readonly recipeInput: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  };
  readonly topic?: string | undefined;
  readonly selectedRecipeId?: string | undefined;
  readonly shell?: T3TeamSidecarSectionShellProps<T3TeamSidecarRecipeQuickStart> | undefined;
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
    filterT3TeamSidecarRecipesByTopic(buildT3TeamSidecarRecipeQuickStarts(props.recipeInput), topic)
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
  const runDashboardRecipeAction = useRunT3TeamDashboardRecipeAction();
  const runWorkflowLaunch = useRunT3TeamDeterministicWorkflowLaunch();
  const quickStarts = useT3TeamSidecarRecipeQuickStarts(sectionProps.recipeInput);
  const filterQuickStarts = filterT3TeamSidecarRecipesByTopic(quickStarts, topic);
  const orderedQuickStarts = orderT3TeamSidecarSectionItems({
    items: filterQuickStarts,
    getItemId: (quickStart) => quickStart.id,
    shell: sectionProps.shell,
  });

  if (orderedQuickStarts.length === 0) {
    return null;
  }

  const applyFilterRecipe = (recipe: T3TeamSidecarRecipeQuickStart) => {
    const dashboardAction = resolveT3TeamDashboardRecipeAction(recipe.id);
    if (dashboardAction) {
      runDashboardRecipeAction(dashboardAction);
      return;
    }

    const bundledRecipe = getBundledT3TeamRecipe(recipe.id);
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

  const renderFilterCard = (recipe: T3TeamSidecarRecipeQuickStart) => {
    const card = (
      <T3TeamFilterActionCard
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

export function T3TeamInlineFiltersSection({
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
