import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProjectRecipeWorkflowDocument, RecipeSurface } from "@t3tools/project-recipes";
import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { T3TeamInlineWorkflowPromptDialog } from "~/t3team/t3team-InlineWorkflowPromptDialog";
import { launchProjectDashboardBacklogDeterministicWorkflow } from "~/t3team/t3team-deterministicWorkflowLaunch";
import {
  createPendingT3TeamInlineWorkflowPrompt,
  type PendingT3TeamInlineWorkflowPrompt,
} from "~/t3team/t3team-inlineRecipeLaunchLocal";

export type T3TeamInlineRecipeLaunchOutcome = {
  readonly applied: boolean;
  readonly promptText?: string;
};

export type T3TeamDeterministicWorkflowLaunch = {
  readonly launchId: string;
  readonly title: string;
  readonly description: string;
  readonly surface: RecipeSurface;
  readonly workflow: ProjectRecipeWorkflowDocument;
  readonly parameters?: Record<string, unknown>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly source?: "bundled" | "project-local";
};

type T3TeamInlineRecipeLaunchHandler = (
  launch: string | T3TeamDeterministicWorkflowLaunch,
) => Promise<T3TeamInlineRecipeLaunchOutcome | null>;

const T3TeamInlineRecipeLaunchContext = createContext<{
  registerHandler: (handler: T3TeamInlineRecipeLaunchHandler | null) => () => void;
  runLaunch: (recipeId: string) => Promise<T3TeamInlineRecipeLaunchOutcome | null>;
  runWorkflowLaunch: (
    launch: T3TeamDeterministicWorkflowLaunch,
  ) => Promise<T3TeamInlineRecipeLaunchOutcome | null>;
}>({
  registerHandler: () => () => undefined,
  runLaunch: async () => null,
  runWorkflowLaunch: async () => null,
});

export async function launchProjectDashboardBacklogInlineRecipe(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly recipeId: string;
  readonly workspaceRoot?: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly state: import("~/t3team/t3team-projectDashboardBacklogStateShared").ProjectDashboardBacklogState;
  readonly currentUserDisplayName: string | undefined;
  readonly setState: (
    nextState:
      | import("~/t3team/t3team-projectDashboardBacklogStateShared").ProjectDashboardBacklogState
      | ((
          current: import("~/t3team/t3team-projectDashboardBacklogStateShared").ProjectDashboardBacklogState,
        ) => import("~/t3team/t3team-projectDashboardBacklogStateShared").ProjectDashboardBacklogState),
  ) => void;
}): Promise<T3TeamInlineRecipeLaunchOutcome | null> {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe?.kickoff) {
    return null;
  }

  return launchProjectDashboardBacklogDeterministicWorkflow({
    backend: input.backend,
    launchId: recipe.id,
    title: recipe.title,
    description: recipe.shortDescription,
    surface: "project.dashboard.backlog",
    workflow: recipe.kickoff,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    state: input.state,
    currentUserDisplayName: input.currentUserDisplayName,
    setState: input.setState,
    source: "bundled",
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(recipe.allowedToolGroups ? { allowedToolGroups: recipe.allowedToolGroups } : {}),
  });
}

export function T3TeamInlineRecipeLaunchProvider({ children }: { readonly children: ReactNode }) {
  const handlerRef = useRef<T3TeamInlineRecipeLaunchHandler | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<
    | (PendingT3TeamInlineWorkflowPrompt & {
        readonly resolve: (outcome: T3TeamInlineRecipeLaunchOutcome | null) => void;
      })
    | null
  >(null);
  const openLocalWorkflowPrompt = useCallback(
    (launch: T3TeamDeterministicWorkflowLaunch) => {
      const prompt = createPendingT3TeamInlineWorkflowPrompt(launch);
      if (!prompt || pendingPrompt) {
        return Promise.resolve(null);
      }

      return new Promise<T3TeamInlineRecipeLaunchOutcome | null>((resolve) => {
        setPendingPrompt({ ...prompt, resolve });
      });
    },
    [pendingPrompt],
  );
  const value = useMemo(
    () => ({
      registerHandler: (handler: T3TeamInlineRecipeLaunchHandler | null) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) {
            handlerRef.current = null;
          }
        };
      },
      runLaunch: (recipeId: string) => handlerRef.current?.(recipeId) ?? Promise.resolve(null),
      runWorkflowLaunch: async (launch: T3TeamDeterministicWorkflowLaunch) => {
        const handled = await (handlerRef.current?.(launch) ?? Promise.resolve(null));
        return handled ?? openLocalWorkflowPrompt(launch);
      },
    }),
    [openLocalWorkflowPrompt],
  );
  const resolvePrompt = useCallback((outcome: T3TeamInlineRecipeLaunchOutcome | null) => {
    setPendingPrompt((current) => {
      current?.resolve(outcome);
      return null;
    });
  }, []);

  return (
    <T3TeamInlineRecipeLaunchContext.Provider value={value}>
      {children}
      <T3TeamInlineWorkflowPromptDialog prompt={pendingPrompt} onResolve={resolvePrompt} />
    </T3TeamInlineRecipeLaunchContext.Provider>
  );
}

export function useRegisterT3TeamInlineRecipeLaunchHandler(
  handler: T3TeamInlineRecipeLaunchHandler | null,
) {
  const { registerHandler } = useContext(T3TeamInlineRecipeLaunchContext);
  useEffect(() => registerHandler(handler), [handler, registerHandler]);
}

export function useRunT3TeamInlineRecipeLaunch() {
  return useContext(T3TeamInlineRecipeLaunchContext).runLaunch;
}

export function useRunT3TeamDeterministicWorkflowLaunch() {
  return useContext(T3TeamInlineRecipeLaunchContext).runWorkflowLaunch;
}
