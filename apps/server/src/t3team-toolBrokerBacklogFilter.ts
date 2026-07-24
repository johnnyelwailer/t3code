/**
 * `t3team.backlog.set_assignee_filter` implementation, extracted from
 * {@link ./t3team-toolBrokerLive.ts} to keep the broker file within the additive size budget.
 * Reads the current-user display name off the bound view state and returns the visible-state
 * patch the client applies.
 */
import * as Effect from "effect/Effect";

import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";

export const setBacklogAssigneeFilterForContext = (
  toolContext: T3TeamTurnToolContext,
  mode: "current-user",
) =>
  Effect.gen(function* () {
    if (mode !== "current-user") {
      return yield* Effect.fail("Only the current-user assignee filter mode is supported.");
    }

    if (!toolContext.state || typeof toolContext.state !== "object") {
      return yield* Effect.fail("Backlog view state is not available.");
    }

    const state = toolContext.state as {
      readonly backlog?: {
        readonly state?: {
          readonly assigneeFilter?: unknown;
        };
        readonly currentUserDisplayName?: unknown;
      };
    };
    const currentUserDisplayName =
      typeof state.backlog?.currentUserDisplayName === "string"
        ? state.backlog.currentUserDisplayName.trim()
        : "";

    if (currentUserDisplayName.length === 0) {
      return yield* Effect.fail("Current user display name is unavailable for this backlog view.");
    }

    const currentAssigneeFilter =
      typeof state.backlog?.state?.assigneeFilter === "string"
        ? state.backlog.state.assigneeFilter
        : undefined;
    const alreadyApplied = currentAssigneeFilter === currentUserDisplayName;

    return {
      ok: true,
      applied: !alreadyApplied,
      promptText: alreadyApplied
        ? `The dashboard is already filtered to work assigned to ${currentUserDisplayName}.`
        : `The dashboard is now filtered to work assigned to ${currentUserDisplayName}.`,
      ...(alreadyApplied
        ? {}
        : {
            viewStatePatch: {
              assigneeFilter: currentUserDisplayName,
            },
          }),
    };
  });
