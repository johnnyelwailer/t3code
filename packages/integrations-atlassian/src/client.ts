import * as Data from "effect/Data";

export class AtlassianApiError extends Data.TaggedError("AtlassianApiError")<{
  readonly status: number;
  readonly message: string;
  readonly path: string;
}> {}

export class AtlassianNetworkError extends Data.TaggedError("AtlassianNetworkError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class AtlassianAuthError extends Data.TaggedError("AtlassianAuthError")<{
  readonly message: string;
  readonly path: string;
}> {}

/**
 * The mirror source could not be read at all: no client is registered for the
 * account, or the project lookup did not return the project. Distinct from a
 * successful page with zero items — callers that prune based on a full walk
 * (the mirror reconcile) must treat this as "provider unavailable", never as
 * "project is empty".
 */
export class AtlassianMirrorSourceUnavailableError extends Data.TaggedError(
  "AtlassianMirrorSourceUnavailableError",
)<{
  readonly reason: "client-unavailable" | "project-not-found";
  readonly externalProjectId: string;
  readonly message: string;
}> {}

export type AtlassianCredentialSet = {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
};

export type JiraMyself = {
  readonly accountId: string;
  readonly displayName: string;
  readonly emailAddress?: string;
};

export type JiraUser = {
  readonly accountId: string;
  readonly displayName: string;
  readonly emailAddress?: string;
};

export type JiraField = {
  readonly id: string;
  readonly name: string;
  readonly schema?: {
    readonly type?: string;
    readonly custom?: string;
    readonly customId?: number;
  };
};

export type JiraProject = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly projectTypeKey?: string;
  readonly avatarUrls?: Record<string, string>;
  readonly self?: string;
};

export type JiraProjectSearchResponse = {
  readonly values: ReadonlyArray<JiraProject>;
  readonly total: number;
  readonly isLast?: boolean;
};

export type JiraBoard = {
  readonly id: string | number;
  readonly self?: string;
  readonly name: string;
  readonly type?: string;
  readonly location?: {
    readonly projectId?: string | number;
    readonly projectKey?: string;
    readonly projectName?: string;
    readonly displayName?: string;
    readonly projectTypeKey?: string;
    readonly avatarURI?: string;
    readonly name?: string;
  };
  readonly isPrivate?: boolean;
};

export type JiraBoardConfigurationStatus = {
  readonly id?: string | number;
  readonly name?: string;
};

export type JiraBoardConfigurationColumn = {
  readonly name?: string;
  readonly statuses?: ReadonlyArray<JiraBoardConfigurationStatus>;
};

export type JiraBoardConfigurationResponse = {
  readonly columnConfig?: {
    readonly columns?: ReadonlyArray<JiraBoardConfigurationColumn>;
  };
};

export type JiraBoardSearchResponse = {
  readonly values: ReadonlyArray<JiraBoard>;
  readonly total?: number;
  readonly startAt?: number;
  readonly maxResults?: number;
  readonly isLast?: boolean;
};

export type JiraSprint = {
  readonly id: string | number;
  readonly self?: string;
  readonly state?: string;
  readonly name: string;
  readonly originBoardId?: string | number;
  readonly boardId?: string | number;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly completeDate?: string;
  readonly createdDate?: string;
};

export type JiraSprintSearchResponse = {
  readonly values: ReadonlyArray<JiraSprint>;
  readonly total?: number;
  readonly startAt?: number;
  readonly maxResults?: number;
  readonly isLast?: boolean;
};

export type JiraFilter = {
  readonly id: string | number;
  readonly name: string;
  readonly jql?: string;
  readonly favourite?: boolean;
  readonly owner?: {
    readonly accountId?: string;
    readonly displayName?: string;
  };
};

export type JiraFilterSearchResponse = {
  readonly values: ReadonlyArray<JiraFilter>;
  readonly total?: number;
  readonly startAt?: number;
  readonly maxResults?: number;
  readonly isLast?: boolean;
};

// Shape of /rest/api/3/search/jql: pagination is token-based (nextPageToken /
// isLast); the endpoint ignores startAt and does not return total.
export type JiraIssueSearchResponse = {
  readonly issues: ReadonlyArray<unknown>;
  readonly total?: number;
  readonly startAt?: number;
  readonly maxResults?: number;
  readonly nextPageToken?: string;
  readonly isLast?: boolean;
};

export type JiraIssue = {
  readonly id: string;
  readonly key: string;
  readonly self: string;
  readonly fields: Record<string, unknown>;
};

export type JiraStatusCategory = {
  readonly id?: string | number;
  readonly key?: string;
  readonly name?: string;
  readonly colorName?: string;
};

export type JiraStatus = {
  readonly id?: string | number;
  readonly name?: string;
  readonly statusCategory?: JiraStatusCategory;
};

export type JiraProjectIssueTypeStatuses = {
  readonly id?: string | number;
  readonly name?: string;
  readonly statuses?: ReadonlyArray<JiraStatus>;
};

export type JiraIssueTransition = {
  readonly id: string;
  readonly name: string;
  readonly to?: JiraStatus;
};

export type JiraIssueTransitionsResponse = {
  readonly transitions: ReadonlyArray<JiraIssueTransition>;
};

export type JiraIssueEditMetaResponse = {
  readonly fields?: Record<string, unknown>;
};

export type JiraIssueCreateResponse = {
  readonly id: string;
  readonly key: string;
  readonly self: string;
};

export type JiraCreateMetaIssueType = {
  readonly id: string;
  readonly name: string;
  readonly subtask?: boolean;
  readonly fields?: Record<string, unknown>;
};

export type JiraCreateMetaResponse = {
  readonly projects?: ReadonlyArray<{
    readonly id?: string;
    readonly key?: string;
    readonly issuetypes?: ReadonlyArray<JiraCreateMetaIssueType>;
  }>;
};

export type JiraComment = {
  readonly id: string;
  readonly body?: unknown;
  readonly author?: {
    readonly displayName?: string;
  };
  readonly created?: string;
  readonly updated?: string;
};

export type JiraCommentsResponse = {
  readonly comments: ReadonlyArray<JiraComment>;
  readonly total: number;
};
