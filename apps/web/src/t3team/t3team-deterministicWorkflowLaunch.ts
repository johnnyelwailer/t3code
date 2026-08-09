import { getT3TeamToolDefinition } from "@t3tools/project-context/t3teamToolCatalog";
import type {
  ProjectRecipeLaunchSource,
  ProjectRecipeWorkflowDocument,
  ProjectRecipeWorkflowLaunchToolContext,
  RecipeSurface,
} from "@t3tools/project-recipes";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamInlineRecipeLaunchOutcome } from "~/t3team/t3team-inlineRecipeLaunch";
import type { ProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogStateShared";

type SetProjectDashboardBacklogState = (
  nextState:
    | ProjectDashboardBacklogState
    | ((current: ProjectDashboardBacklogState) => ProjectDashboardBacklogState),
) => void;

function buildProjectDashboardBacklogToolContext(input: {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly state: ProjectDashboardBacklogState;
  readonly currentUserDisplayName: string | undefined;
  readonly toolIds: ReadonlyArray<string>;
}): ProjectRecipeWorkflowLaunchToolContext {
  return {
    surface: "t3team",
    tools: input.toolIds.map((toolId) => {
      const tool = getT3TeamToolDefinition(toolId as Parameters<typeof getT3TeamToolDefinition>[0]);
      return {
        id: tool.id,
        label: tool.label,
        capabilities: [...tool.capabilities],
      };
    }),
    state: {
      view: {
        kind: "project-dashboard-backlog",
        projectId: input.projectId,
        projectTitle: input.projectTitle,
      },
      backlog: {
        state: input.state,
        ...(input.currentUserDisplayName
          ? { currentUserDisplayName: input.currentUserDisplayName }
          : {}),
      },
    },
  };
}

export async function launchProjectDashboardBacklogDeterministicWorkflow(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly launchId: string;
  readonly title: string;
  readonly description: string;
  readonly surface: RecipeSurface;
  readonly workflow: ProjectRecipeWorkflowDocument;
  readonly parameters?: Record<string, unknown> | undefined;
  readonly workspaceRoot?: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly state: ProjectDashboardBacklogState;
  readonly currentUserDisplayName: string | undefined;
  readonly setState: SetProjectDashboardBacklogState;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly source?: ProjectRecipeLaunchSource;
}): Promise<T3TeamInlineRecipeLaunchOutcome | null> {
  if (!input.workspaceRoot) {
    return null;
  }

  const toolIds = [
    ...new Set(
      input.workflow.steps.flatMap((step) => (step.kind === "tool" ? [step.toolName] : [])),
    ),
  ];
  const response = await input.backend.launchRecipeWorkflow({
    workspaceRoot: input.workspaceRoot,
    kickoffMessage: "",
    titleSeed: input.title,
    createdAt: new Date().toISOString(),
    launch: {
      kind: "recipe",
      recipeId: input.launchId,
      kickoff: input.workflow,
      title: input.title,
      description: input.description,
      source: input.source ?? "bundled",
      surface: input.surface,
      ...(input.parameters ? { parameters: input.parameters } : {}),
      ...(input.allowedToolGroups ? { allowedToolGroups: [...input.allowedToolGroups] } : {}),
    },
    toolContext: buildProjectDashboardBacklogToolContext({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      state: input.state,
      currentUserDisplayName: input.currentUserDisplayName,
      toolIds,
    }),
  });

  for (const effect of response.effects ?? []) {
    if (effect.kind !== "view-state-patch") {
      continue;
    }

    input.setState((current) => ({
      ...current,
      ...(effect.statePatch as Partial<ProjectDashboardBacklogState>),
    }));
  }

  return {
    applied: response.completionActivity?.tone === "success",
    ...(response.completionActivity?.description
      ? { promptText: response.completionActivity.description }
      : {}),
  };
}
