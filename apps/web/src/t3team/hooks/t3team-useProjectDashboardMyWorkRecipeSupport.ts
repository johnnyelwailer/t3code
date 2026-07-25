import { useMemo } from "react";

import { usePublishT3TeamDashboardRecipeViewSummary } from "~/t3team/t3team-dashboardRecipeViewContext";
import {
  buildMyWorkNeedsMyActionOutcome,
  useRegisterT3TeamDashboardRecipeActionHandler,
} from "~/t3team/t3team-dashboardRecipeActions";
import { buildMyWorkRecipeViewSummary } from "~/t3team/t3team-dashboardRecipeSummary";
import type { ProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3team/t3team-types";

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
    () => buildMyWorkRecipeViewSummary(input.filteredWorkItems),
    [input.filteredWorkItems],
  );

  usePublishT3TeamDashboardRecipeViewSummary(recipeViewSummary);
  useRegisterT3TeamDashboardRecipeActionHandler(
    useMemo(
      () => (action) => {
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
