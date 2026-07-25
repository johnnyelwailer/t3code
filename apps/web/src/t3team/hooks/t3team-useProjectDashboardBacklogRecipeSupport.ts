import { useMemo } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";

import {
  buildBacklogAssignedToMeOutcome,
  buildBacklogNeedsMyActionOutcome,
  useRegisterT3TeamDashboardRecipeActionHandler,
} from "~/t3team/t3team-dashboardRecipeActions";
import { buildBacklogClearFiltersOutcome } from "~/t3team/t3team-dashboardRecipeFilterOutcomes";
import {
  type T3TeamDeterministicWorkflowLaunch,
  launchProjectDashboardBacklogInlineRecipe,
  useRegisterT3TeamInlineRecipeLaunchHandler,
} from "~/t3team/t3team-inlineRecipeLaunch";
import { launchProjectDashboardBacklogDeterministicWorkflow } from "~/t3team/t3team-deterministicWorkflowLaunch";
import type { ProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogState";
import type { ProjectTicket } from "~/t3team/t3team-types";
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

  useRegisterT3TeamDashboardRecipeActionHandler(
    useMemo(
      () => (action) => {
        if (action.kind === "show-only-assigned-to-me") {
          const outcome = buildBacklogAssignedToMeOutcome(
            input.state,
            input.currentUserDisplayName,
          );
          if (!outcome) {
            return { applied: false };
          }

          input.setState(outcome.nextState);
          return { applied: true, promptText: outcome.promptText };
        }

        if (action.kind === "clear-filters") {
          const outcome = buildBacklogClearFiltersOutcome(input.state);
          input.setState(outcome.nextState);
          return { applied: true, promptText: outcome.promptText };
        }

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

  useRegisterT3TeamInlineRecipeLaunchHandler(
    useMemo(
      () =>
        backend
          ? async (launch) => {
              if (typeof launch === "string") {
                return launchProjectDashboardBacklogInlineRecipe({
                  backend,
                  recipeId: launch,
                  projectId: input.project.id,
                  projectTitle: input.project.title,
                  state: input.state,
                  currentUserDisplayName: input.currentUserDisplayName,
                  setState: input.setState,
                  ...(input.project.workspace?.rootPath
                    ? { workspaceRoot: input.project.workspace.rootPath }
                    : {}),
                });
              }

              const workflowLaunch = launch as T3TeamDeterministicWorkflowLaunch;
              if (workflowLaunch.surface !== "project.dashboard.backlog") {
                return null;
              }

              return launchProjectDashboardBacklogDeterministicWorkflow({
                backend,
                launchId: workflowLaunch.launchId,
                title: workflowLaunch.title,
                description: workflowLaunch.description,
                surface: workflowLaunch.surface,
                workflow: workflowLaunch.workflow,
                projectId: input.project.id,
                projectTitle: input.project.title,
                state: input.state,
                currentUserDisplayName: input.currentUserDisplayName,
                setState: input.setState,
                ...(workflowLaunch.parameters ? { parameters: workflowLaunch.parameters } : {}),
                ...(workflowLaunch.allowedToolGroups
                  ? { allowedToolGroups: workflowLaunch.allowedToolGroups }
                  : {}),
                ...(workflowLaunch.source ? { source: workflowLaunch.source } : {}),
                ...(input.project.workspace?.rootPath
                  ? { workspaceRoot: input.project.workspace.rootPath }
                  : {}),
              });
            }
          : null,
      [backend, input],
    ),
  );
}
