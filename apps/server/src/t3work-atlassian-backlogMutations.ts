import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import {
  incrementCachedT3workAtlassianBacklogSubtaskCount,
  insertCachedT3workAtlassianBacklogChildIssue,
  updateCachedT3workAtlassianBacklogAssignee,
  updateCachedT3workAtlassianBacklogEstimate,
} from "./t3work-atlassian-backlog-cache.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { T3workAtlassianError, tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import type {
  T3workAtlassianAssignableUsersInput,
  T3workAtlassianBacklogAssigneeUpdateInput,
  T3workAtlassianBacklogCreateSubtaskInput,
  T3workAtlassianBacklogEstimateUpdateInput,
  T3workAtlassianIssueStatusUpdateInput,
} from "./t3work-atlassian-backlogTypes.ts";

export function searchT3workAtlassianAssignableUsers(input: T3workAtlassianAssignableUsersInput) {
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

export function updateT3workAtlassianBacklogAssignee(
  input: T3workAtlassianBacklogAssigneeUpdateInput,
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

    yield* updateCachedT3workAtlassianBacklogAssignee({
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

export function updateT3workAtlassianBacklogEstimate(
  input: T3workAtlassianBacklogEstimateUpdateInput,
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

    yield* updateCachedT3workAtlassianBacklogEstimate({
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

export function updateT3workAtlassianIssueStatus(input: T3workAtlassianIssueStatusUpdateInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3workAtlassianError({
        message: "Kanban status changes require a live Atlassian connection.",
      });
    }

    return yield* tryAtlassianPromise(
      () => provider.transitionIssueStatus(input.accountId, input.issueIdOrKey, input.targetStatus),
      "Failed to update Jira status.",
    );
  });
}

export function createT3workAtlassianBacklogSubtask(
  input: T3workAtlassianBacklogCreateSubtaskInput,
) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3workAtlassianError({
        message: "Backlog subtask creation requires a live Atlassian connection.",
      });
    }

    const created = yield* tryAtlassianPromise(
      () => provider.createSubtask(input),
      "Failed to create Jira subtask.",
    );

    yield* incrementCachedT3workAtlassianBacklogSubtaskCount({
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
      yield* insertCachedT3workAtlassianBacklogChildIssue({
        provider: "atlassian",
        accountId: input.accountId,
        parentIssueIdOrKey: input.parentIssueIdOrKey,
        item: item as BacklogResourceRef,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return { ...created, ...(item ? { item } : {}) };
  });
}
