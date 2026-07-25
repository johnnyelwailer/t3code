import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  resolveBacklogNeedsMyActionPreset,
  resolveMyWorkNeedsMyActionPreset,
  type T3TeamDashboardNeedsMyActionPreset,
} from "~/t3team/t3team-dashboardRecipeSummary";
import {
  type ProjectDashboardBacklogState,
} from "~/t3team/t3team-projectDashboardBacklogStateShared";
import type { ProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectBacklogFocusFilter } from "~/t3team/t3team-projectBacklogUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type T3TeamDashboardRecipeAction =
  | {
      readonly kind: "focus-needs-my-action";
    }
  | {
      readonly kind: "show-only-assigned-to-me";
    }
  | {
      readonly kind: "clear-filters";
    };

export type T3TeamDashboardRecipeActionOutcome = {
  readonly applied: boolean;
  readonly promptText?: string;
};

type T3TeamDashboardRecipeActionHandler = (
  action: T3TeamDashboardRecipeAction,
) => T3TeamDashboardRecipeActionOutcome | null;

const T3TeamDashboardRecipeActionContext = createContext<{
  registerHandler: (handler: T3TeamDashboardRecipeActionHandler | null) => () => void;
  runAction: (action: T3TeamDashboardRecipeAction) => T3TeamDashboardRecipeActionOutcome | null;
} | null>(null);

export function resolveT3TeamDashboardRecipeAction(
  recipeId: string,
): T3TeamDashboardRecipeAction | undefined {
  if (recipeId === "focus-needs-my-action") {
    return { kind: "focus-needs-my-action" };
  }
  if (recipeId === "show-only-assigned-to-me") {
    return { kind: "show-only-assigned-to-me" };
  }
  if (recipeId === "clear-filters") {
    return { kind: "clear-filters" };
  }
  return undefined;
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
  statusCategory: Extract<T3TeamDashboardNeedsMyActionPreset, "review" | "active">,
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

export function T3TeamDashboardRecipeActionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const handlerRef = useRef<T3TeamDashboardRecipeActionHandler | null>(null);
  const value = useMemo(
    () => ({
      registerHandler: (handler: T3TeamDashboardRecipeActionHandler | null) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) {
            handlerRef.current = null;
          }
        };
      },
      runAction: (action: T3TeamDashboardRecipeAction) => handlerRef.current?.(action) ?? null,
    }),
    [],
  );

  return (
    <T3TeamDashboardRecipeActionContext.Provider value={value}>
      {children}
    </T3TeamDashboardRecipeActionContext.Provider>
  );
}

function useT3TeamDashboardRecipeActionContext() {
  const context = useContext(T3TeamDashboardRecipeActionContext);
  if (!context) {
    throw new Error(
      "Dashboard recipe actions must be used inside T3TeamDashboardRecipeActionProvider.",
    );
  }
  return context;
}

export function useRegisterT3TeamDashboardRecipeActionHandler(
  handler: T3TeamDashboardRecipeActionHandler | null,
) {
  const { registerHandler } = useT3TeamDashboardRecipeActionContext();

  useEffect(() => registerHandler(handler), [handler, registerHandler]);
}

export function useRunT3TeamDashboardRecipeAction() {
  return useT3TeamDashboardRecipeActionContext().runAction;
}
