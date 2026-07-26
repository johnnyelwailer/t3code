import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import {
  incrementCachedT3TeamAtlassianBacklogSubtaskCount,
  insertCachedT3TeamAtlassianBacklogChildIssue,
  updateCachedT3TeamAtlassianBacklogAssignee,
  updateCachedT3TeamAtlassianBacklogEstimate,
} from "./t3team-atlassian-backlog-cache.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import type {
  T3TeamAtlassianAssignableUsersInput,
  T3TeamAtlassianBacklogAssigneeUpdateInput,
  T3TeamAtlassianBacklogCreateSubtaskInput,
  T3TeamAtlassianBacklogEstimateUpdateInput,
  T3TeamAtlassianChildIssueTypesInput,
  T3TeamAtlassianIssueStatusUpdateInput,
} from "./t3team-atlassian-backlogTypes.ts";

export function searchT3TeamAtlassianAssignableUsers(input: T3TeamAtlassianAssignableUsersInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return [];
    }
    return yield* tryAtlassianPromise(
      () => provider.searchAssignableUsers(input.accountId, input.issueIdOrKey, input.query ?? ""),
      "Failed to load assignable Jira users.",
    );
  });
}

export function updateT3TeamAtlassianBacklogAssignee(
  input: T3TeamAtlassianBacklogAssigneeUpdateInput,
) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return;
    }

    yield* tryAtlassianPromise(
      () =>
        provider.updateIssueAssignee(
          input.accountId,
          input.issueIdOrKey,
          input.assigneeAccountId ?? null,
        ),
      "Failed to update Jira assignee.",
    );

    yield* updateCachedT3TeamAtlassianBacklogAssignee({
      provider: "atlassian",
      accountId: input.accountId,
      issueIdOrKey: input.issueIdOrKey,
      ...(input.assigneeAccountId
        ? {
            assigneeAccountId: input.assigneeAccountId,
            assigneeDisplayName: input.assigneeDisplayName ?? input.assigneeAccountId,
          }
        : {}),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function updateT3TeamAtlassianBacklogEstimate(
  input: T3TeamAtlassianBacklogEstimateUpdateInput,
) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return { label: "Estimate" };
    }

    const result = yield* tryAtlassianPromise(
      () =>
        provider.updateIssueEstimate(
          input.accountId,
          input.issueIdOrKey,
          input.estimateValue,
          input.estimateMode,
        ),
      "Failed to update Jira estimate.",
    );

    yield* updateCachedT3TeamAtlassianBacklogEstimate({
      provider: "atlassian",
      accountId: input.accountId,
      issueIdOrKey: input.issueIdOrKey,
      estimateValue: input.estimateValue,
      mode: input.estimateMode ?? "points",
      ...(result.label ? { estimateFieldLabel: result.label } : {}),
    }).pipe(Effect.catch(() => Effect.void));

    return result;
  });
}

export function updateT3TeamAtlassianIssueStatus(input: T3TeamAtlassianIssueStatusUpdateInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({
        message: "Kanban status changes require a live Atlassian connection.",
      });
    }

    return yield* tryAtlassianPromise(
      () => provider.transitionIssueStatus(input.accountId, input.issueIdOrKey, input.targetStatus),
      "Failed to update Jira status.",
    );
  });
}

export function createT3TeamAtlassianBacklogSubtask(
  input: T3TeamAtlassianBacklogCreateSubtaskInput,
) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({
        message: "Backlog subtask creation requires a live Atlassian connection.",
      });
    }

    const created = yield* tryAtlassianPromise(
      () => provider.createSubtask(input),
      "Failed to create Jira subtask.",
    );

    yield* incrementCachedT3TeamAtlassianBacklogSubtaskCount({
      provider: "atlassian",
      accountId: input.accountId,
      issueIdOrKey: input.parentIssueIdOrKey,
    }).pipe(Effect.catch(() => Effect.void));

    // Fetch the created issue directly by key — Jira's search index lags issue
    // creation by seconds, so sync/search pages won't include it yet — and
    // seed it into the backlog cache next to its parent so it shows up
    // immediately in cached views and resolves with full details.
    const item = yield* tryAtlassianPromise(
      () =>
        provider.getBacklogIssue({
          accountId: input.accountId,
          issueIdOrKey: created.key,
        }),
      "Failed to load the created Jira subtask.",
    ).pipe(Effect.catch(() => Effect.succeed(null)));

    if (item) {
      yield* insertCachedT3TeamAtlassianBacklogChildIssue({
        provider: "atlassian",
        accountId: input.accountId,
        parentIssueIdOrKey: input.parentIssueIdOrKey,
        item: item as BacklogResourceRef,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return { ...created, ...(item ? { item } : {}) };
  });
}

export function listT3TeamAtlassianChildIssueTypes(input: T3TeamAtlassianChildIssueTypesInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return [];
    }
    return yield* tryAtlassianPromise(
      () => provider.getChildIssueTypes(input),
      "Failed to load Jira child issue types.",
    );
  });
}
