import { useMemo } from "react";
import { useBackend } from "~/t3work/backend/t3work-index";

import {
  buildBacklogNeedsMyActionOutcome,
  useRegisterT3workDashboardRecipeActionHandler,
} from "~/t3work/t3work-dashboardRecipeActions";
import {
  launchProjectDashboardBacklogInlineRecipe,
  useRegisterT3workInlineRecipeLaunchHandler,
} from "~/t3work/t3work-inlineRecipeLaunch";
import type { ProjectDashboardBacklogState } from "~/t3work/t3work-projectDashboardBacklogState";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { ProjectShellProject } from "@t3tools/project-context";

type SetProjectDashboardBacklogState = (
  nextState:
    | ProjectDashboardBacklogState
    | ((current: ProjectDashboardBacklogState) => ProjectDashboardBacklogState),
) => void;

export function useProjectDashboardBacklogRecipeSupport(input: {
  readonly project: ProjectShellProject;
  readonly state: ProjectDashboardBacklogState;
  readonly currentUserDisplayName: string | undefined;
  readonly filteredTickets: ReadonlyArray<ProjectTicket>;
  readonly setState: SetProjectDashboardBacklogState;
}) {
  const backend = useBackend();

  useRegisterT3workDashboardRecipeActionHandler(
    useMemo(
      () => (action) => {
        if (action.kind !== "focus-needs-my-action") {
          return null;
        }

        const outcome = buildBacklogNeedsMyActionOutcome(input.state, input.filteredTickets);
        if (!outcome) {
          return { applied: false };
        }

        input.setState(outcome.nextState);
        return { applied: true, promptText: outcome.promptText };
      },
      [input],
    ),
  );

  useRegisterT3workInlineRecipeLaunchHandler(
    useMemo(
      () =>
        backend
          ? async (recipeId) =>
              launchProjectDashboardBacklogInlineRecipe({
                backend,
                recipeId,
                projectId: input.project.id,
                projectTitle: input.project.title,
                state: input.state,
                currentUserDisplayName: input.currentUserDisplayName,
                setState: input.setState,
                ...(input.project.workspace?.rootPath
                  ? { workspaceRoot: input.project.workspace.rootPath }
                  : {}),
              })
          : null,
      [backend, input],
    ),
  );
}
