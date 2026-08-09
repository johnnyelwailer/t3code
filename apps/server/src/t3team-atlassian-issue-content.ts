import {
  AtlassianIntegrationProvider,
  type JiraIssueLinkType,
} from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";

export type T3TeamAtlassianIssueCommentCreateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly body: string;
};

export type T3TeamAtlassianIssueCommentUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly commentId: string;
  readonly body: string;
};

export type T3TeamAtlassianIssueCommentDeleteInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly commentId: string;
};

export type T3TeamAtlassianIssueLinkCreateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly otherIssueIdOrKey: string;
  readonly linkTypeName: string;
  readonly direction: "inward" | "outward";
};

export type T3TeamAtlassianIssueLinkDeleteInput = {
  readonly accountId: string;
  readonly linkId: string;
};

export type T3TeamAtlassianIssueLinkTypesInput = {
  readonly accountId: string;
};

const NO_LIVE_CONNECTION_MESSAGE = "This action requires a live Atlassian connection.";

export function createT3TeamAtlassianIssueComment(input: T3TeamAtlassianIssueCommentCreateInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({ message: NO_LIVE_CONNECTION_MESSAGE });
    }
    return yield* tryAtlassianPromise(
      () => provider.addIssueComment(input.accountId, input.issueIdOrKey, input.body),
      "Failed to add the Jira comment.",
    );
  });
}

export function updateT3TeamAtlassianIssueComment(input: T3TeamAtlassianIssueCommentUpdateInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({ message: NO_LIVE_CONNECTION_MESSAGE });
    }
    yield* tryAtlassianPromise(
      () =>
        provider.updateIssueComment(
          input.accountId,
          input.issueIdOrKey,
          input.commentId,
          input.body,
        ),
      "Failed to update the Jira comment.",
    );
  });
}

export function deleteT3TeamAtlassianIssueComment(input: T3TeamAtlassianIssueCommentDeleteInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({ message: NO_LIVE_CONNECTION_MESSAGE });
    }
    yield* tryAtlassianPromise(
      () => provider.deleteIssueComment(input.accountId, input.issueIdOrKey, input.commentId),
      "Failed to delete the Jira comment.",
    );
  });
}

export function createT3TeamAtlassianIssueLink(input: T3TeamAtlassianIssueLinkCreateInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({ message: NO_LIVE_CONNECTION_MESSAGE });
    }
    yield* tryAtlassianPromise(
      () =>
        provider.createIssueLink(input.accountId, {
          issueIdOrKey: input.issueIdOrKey,
          otherIssueIdOrKey: input.otherIssueIdOrKey,
          linkTypeName: input.linkTypeName,
          direction: input.direction,
        }),
      "Failed to create the Jira issue link.",
    );
  });
}

export function deleteT3TeamAtlassianIssueLink(input: T3TeamAtlassianIssueLinkDeleteInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({ message: NO_LIVE_CONNECTION_MESSAGE });
    }
    yield* tryAtlassianPromise(
      () => provider.deleteIssueLink(input.accountId, input.linkId),
      "Failed to delete the Jira issue link.",
    );
  });
}

export function listT3TeamAtlassianIssueLinkTypes(input: T3TeamAtlassianIssueLinkTypesInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return [] as ReadonlyArray<JiraIssueLinkType>;
    }
    return yield* tryAtlassianPromise(
      () => provider.getIssueLinkTypes(input.accountId),
      "Failed to load Jira issue link types.",
    );
  });
}
