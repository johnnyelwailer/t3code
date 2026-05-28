import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { ProjectDashboardBacklogState } from "~/t3work/t3work-projectDashboardBacklogStateShared";
import type { ProjectDashboardMyWorkState } from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectBacklogFocusFilter } from "~/t3work/t3work-projectBacklogUtils";
import {
  resolveBacklogNeedsMyActionPreset,
  resolveMyWorkNeedsMyActionPreset,
  type T3workDashboardNeedsMyActionPreset,
} from "~/t3work/t3work-dashboardRecipeSummary";
import type { ProjectTicket } from "~/t3work/t3work-types";

export type T3workDashboardRecipeAction =
  | {
      readonly kind: "focus-needs-my-action";
    }
  | {
      readonly kind: "show-only-assigned-to-me";
    };

export type T3workDashboardRecipeActionOutcome = {
  readonly applied: boolean;
  readonly promptText?: string;
};

type T3workDashboardRecipeActionHandler = (
  action: T3workDashboardRecipeAction,
) => T3workDashboardRecipeActionOutcome | null;

const T3workDashboardRecipeActionContext = createContext<{
  registerHandler: (handler: T3workDashboardRecipeActionHandler | null) => () => void;
  runAction: (action: T3workDashboardRecipeAction) => T3workDashboardRecipeActionOutcome | null;
} | null>(null);

export function resolveT3workDashboardRecipeAction(
  recipeId: string,
): T3workDashboardRecipeAction | undefined {
  return recipeId === "focus-needs-my-action"
    ? {
        kind: "focus-needs-my-action",
      }
    : undefined;
}

export function buildBacklogAssignedToMeOutcome(
  state: ProjectDashboardBacklogState,
  currentUserDisplayName: string | undefined,
): {
  readonly nextState: ProjectDashboardBacklogState;
  readonly promptText: string;
} | null {
  const displayName = currentUserDisplayName?.trim();
  if (!displayName) {
    return null;
  }
  if (state.assigneeFilter === displayName) {
    return {
      nextState: state,
      promptText: `The dashboard is already filtered to work assigned to ${displayName}.`,
    };
  }

  return {
    nextState: {
      ...state,
      assigneeFilter: displayName,
    },
    promptText: `The dashboard is now filtered to work assigned to ${displayName}.`,
  };
}

function resolveBacklogNeedsMyActionFocus(
  tickets: ReadonlyArray<ProjectTicket>,
): ProjectBacklogFocusFilter | null {
  return resolveBacklogNeedsMyActionPreset(tickets) ?? null;
}

function describeBacklogNeedsMyActionFocus(focusFilter: ProjectBacklogFocusFilter): string {
  switch (focusFilter) {
    case "needs-plan":
      return "The dashboard is now filtered to backlog items that still need planning, an estimate, or a clear owner.";
    case "unassigned":
      return "The dashboard is now filtered to backlog items that still need an assignee.";
    case "with-subtasks":
      return "The dashboard is now filtered to backlog items with subtasks so you can focus on coordination and unblock decisions.";
    default:
      return "The dashboard is now filtered to the backlog items most likely to need your action.";
  }
}

export function buildBacklogNeedsMyActionOutcome(
  state: ProjectDashboardBacklogState,
  tickets: ReadonlyArray<ProjectTicket>,
): {
  readonly nextState: ProjectDashboardBacklogState;
  readonly promptText: string;
} | null {
  const focusFilter = resolveBacklogNeedsMyActionFocus(tickets);
  if (!focusFilter) {
    return null;
  }

  return {
    nextState: {
      ...state,
      focusFilter,
    },
    promptText: describeBacklogNeedsMyActionFocus(focusFilter),
  };
}

function describeMyWorkNeedsMyActionCategory(
  statusCategory: Extract<T3workDashboardNeedsMyActionPreset, "review" | "active">,
): string {
  return statusCategory === "review"
    ? "The dashboard is now filtered to your review-stage work so you can respond to the items already waiting on you."
    : "The dashboard is now filtered to your active work so you can focus on the items that still need your next move.";
}

export function buildMyWorkNeedsMyActionOutcome(
  state: ProjectDashboardMyWorkState,
  tickets: ReadonlyArray<ProjectTicket>,
): {
  readonly nextState: ProjectDashboardMyWorkState;
  readonly promptText: string;
} | null {
  const statusCategory = resolveMyWorkNeedsMyActionPreset(tickets) ?? null;

  if (!statusCategory) {
    return null;
  }

  return {
    nextState: {
      ...state,
      statusCategory,
    },
    promptText: describeMyWorkNeedsMyActionCategory(statusCategory),
  };
}

export function T3workDashboardRecipeActionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const handlerRef = useRef<T3workDashboardRecipeActionHandler | null>(null);
  const value = useMemo(
    () => ({
      registerHandler: (handler: T3workDashboardRecipeActionHandler | null) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) {
            handlerRef.current = null;
          }
        };
      },
      runAction: (action: T3workDashboardRecipeAction) => handlerRef.current?.(action) ?? null,
    }),
    [],
  );

  return (
    <T3workDashboardRecipeActionContext.Provider value={value}>
      {children}
    </T3workDashboardRecipeActionContext.Provider>
  );
}

function useT3workDashboardRecipeActionContext() {
  const context = useContext(T3workDashboardRecipeActionContext);
  if (!context) {
    throw new Error(
      "Dashboard recipe actions must be used inside T3workDashboardRecipeActionProvider.",
    );
  }
  return context;
}

export function useRegisterT3workDashboardRecipeActionHandler(
  handler: T3workDashboardRecipeActionHandler | null,
) {
  const { registerHandler } = useT3workDashboardRecipeActionContext();

  useEffect(() => registerHandler(handler), [handler, registerHandler]);
}

export function useRunT3workDashboardRecipeAction() {
  return useT3workDashboardRecipeActionContext().runAction;
}
