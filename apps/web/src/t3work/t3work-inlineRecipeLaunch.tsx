import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { getT3workToolDefinition } from "@t3tools/project-context/t3workToolCatalog";
import { getBundledT3WorkRecipe } from "@t3tools/t3work-skill-packs";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectDashboardBacklogState } from "~/t3work/t3work-projectDashboardBacklogStateShared";

export type T3workInlineRecipeLaunchOutcome = {
  readonly applied: boolean;
  readonly promptText?: string;
};

type T3workInlineRecipeLaunchHandler = (
  recipeId: string,
) => Promise<T3workInlineRecipeLaunchOutcome | null>;

const T3workInlineRecipeLaunchContext = createContext<{
  registerHandler: (handler: T3workInlineRecipeLaunchHandler | null) => () => void;
  runLaunch: (recipeId: string) => Promise<T3workInlineRecipeLaunchOutcome | null>;
}>({
  registerHandler: () => () => undefined,
  runLaunch: async () => null,
});

type SetProjectDashboardBacklogState = (
  nextState:
    | ProjectDashboardBacklogState
    | ((current: ProjectDashboardBacklogState) => ProjectDashboardBacklogState),
) => void;

export async function launchProjectDashboardBacklogInlineRecipe(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly recipeId: string;
  readonly workspaceRoot?: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly state: ProjectDashboardBacklogState;
  readonly currentUserDisplayName: string | undefined;
  readonly setState: SetProjectDashboardBacklogState;
}): Promise<T3workInlineRecipeLaunchOutcome | null> {
  const recipe = getBundledT3WorkRecipe(input.recipeId);
  if (!recipe?.kickoff || !input.workspaceRoot) {
    return null;
  }

  const toolIds = [
    ...new Set(
      recipe.kickoff.steps.flatMap((step) => (step.kind === "tool" ? [step.toolName] : [])),
    ),
  ];
  const toolContext = {
    surface: "t3work",
    tools: toolIds.map((toolId) => {
      const tool = getT3workToolDefinition(toolId as Parameters<typeof getT3workToolDefinition>[0]);
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

  const createdAt = new Date().toISOString();
  const response = await input.backend.launchRecipeWorkflow({
    workspaceRoot: input.workspaceRoot,
    kickoffMessage: "",
    titleSeed: recipe.title,
    createdAt,
    launch: {
      kind: "recipe",
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      ...(recipe.kickoff ? { kickoff: recipe.kickoff } : {}),
      title: recipe.title,
      description: recipe.shortDescription,
      source: "bundled",
      surface: "project.dashboard.backlog",
      allowedToolGroups: [...recipe.allowedToolGroups],
    },
    toolContext,
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

export function T3workInlineRecipeLaunchProvider({ children }: { readonly children: ReactNode }) {
  const handlerRef = useRef<T3workInlineRecipeLaunchHandler | null>(null);
  const value = useMemo(
    () => ({
      registerHandler: (handler: T3workInlineRecipeLaunchHandler | null) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) {
            handlerRef.current = null;
          }
        };
      },
      runLaunch: (recipeId: string) => handlerRef.current?.(recipeId) ?? Promise.resolve(null),
    }),
    [],
  );

  return (
    <T3workInlineRecipeLaunchContext.Provider value={value}>
      {children}
    </T3workInlineRecipeLaunchContext.Provider>
  );
}

export function useRegisterT3workInlineRecipeLaunchHandler(
  handler: T3workInlineRecipeLaunchHandler | null,
) {
  const { registerHandler } = useContext(T3workInlineRecipeLaunchContext);
  useEffect(() => registerHandler(handler), [handler, registerHandler]);
}

export function useRunT3workInlineRecipeLaunch() {
  return useContext(T3workInlineRecipeLaunchContext).runLaunch;
}
