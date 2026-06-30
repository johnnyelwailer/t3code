import { useMemo } from "react";

import { usePublishT3workDashboardRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeViewContext";
import {
  buildMyWorkNeedsMyActionOutcome,
  useRegisterT3workDashboardRecipeActionHandler,
} from "~/t3work/t3work-dashboardRecipeActions";
import {
  buildMyWorkClearFiltersOutcome,
  hasMyWorkViewFiltersActive,
} from "~/t3work/t3work-dashboardRecipeFilterOutcomes";
import { buildMyWorkRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";
import type { ProjectDashboardMyWorkState } from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function useProjectDashboardMyWorkRecipeSupport(input: {
  readonly state: ProjectDashboardMyWorkState;
  readonly filteredWorkItems: ReadonlyArray<ProjectTicket>;
  readonly setQuery: (value: string) => void;
  readonly setStatusCategory: (value: ProjectDashboardMyWorkState["statusCategory"]) => void;
  readonly setShowGitHubActivity: (value: boolean) => void;
  readonly setSelectedPriority: (value: string) => void;
  readonly setSelectedStatus: (value: string) => void;
}) {
  const recipeViewSummary = useMemo(
    () => ({
      ...buildMyWorkRecipeViewSummary(input.filteredWorkItems),
      viewFiltersActive: hasMyWorkViewFiltersActive(input.state),
    }),
    [input.filteredWorkItems, input.state],
  );

  usePublishT3workDashboardRecipeViewSummary(recipeViewSummary);
  useRegisterT3workDashboardRecipeActionHandler(
    useMemo(
      () => (action) => {
        if (action.kind === "clear-filters") {
          const outcome = buildMyWorkClearFiltersOutcome(input.state);
          input.setQuery(outcome.nextState.query);
          input.setStatusCategory(outcome.nextState.statusCategory);
          input.setShowGitHubActivity(outcome.nextState.showGitHubActivity);
          input.setSelectedPriority(outcome.nextState.selectedPriority);
          input.setSelectedStatus(outcome.nextState.selectedStatus);
          return { applied: true, promptText: outcome.promptText };
        }

        if (action.kind !== "focus-needs-my-action") {
          return null;
        }

        const outcome = buildMyWorkNeedsMyActionOutcome(input.state, input.filteredWorkItems);
        if (!outcome) {
          return { applied: false };
        }

        input.setQuery(outcome.nextState.query);
        input.setStatusCategory(outcome.nextState.statusCategory);
        input.setShowGitHubActivity(outcome.nextState.showGitHubActivity);
        input.setSelectedPriority(outcome.nextState.selectedPriority);
        input.setSelectedStatus(outcome.nextState.selectedStatus);

        return { applied: true, promptText: outcome.promptText };
      },
      [input],
    ),
  );
}
