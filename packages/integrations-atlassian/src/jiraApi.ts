import type { AtlassianOAuthConfig, TokenExchangeResult } from "./oauth.ts";
import { listAccessibleResources } from "./oauth.ts";
import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  type JiraBoard,
  type JiraBoardConfigurationResponse,
  type JiraBoardSearchResponse,
  type JiraCreateMetaIssueTypesResponse,
  type JiraCommentsResponse,
  type JiraField,
  type JiraIssueLinkTypesResponse,
  type JiraFilter,
  type JiraFilterSearchResponse,
  type JiraIssue,
  type JiraIssueEditMetaResponse,
  type JiraIssueCreateResponse,
  type JiraIssueTransition,
  type JiraIssueTransitionsResponse,
  type JiraProjectIssueTypeStatuses,
  type JiraIssueSearchResponse,
  type JiraMyself,
  type JiraProject,
  type JiraProjectSearchResponse,
  type JiraQuickFilterSearchResponse,
  type JiraSprintSearchResponse,
  type JiraUser,
} from "./client.ts";

export type JiraApiAuth =
  | {
      readonly kind: "oauth";
      readonly cloudId: string;
      readonly siteUrl?: string | undefined;
      readonly accessToken: string;
      readonly refreshToken?: string | undefined;
      readonly expiresAt?: number | undefined;
    }
  | {
      readonly kind: "basic";
      readonly siteUrl: string;
      readonly email: string;
      readonly apiToken: string;
    };

export const JIRA_API_TIMEOUT_MS = 10_000;

export function jiraCloudApiBaseUrl(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

async function fetchWithJiraTimeout(url: string, init?: RequestInit): Promise<Response> {
  const abortController = new AbortController();
  const upstreamSignal = init?.signal ?? undefined;
  const timeoutSignal = AbortSignal.timeout(JIRA_API_TIMEOUT_MS);
  let didTimeout = false;

  const onTimeoutAbort = () => {
    didTimeout = true;
    abortController.abort(timeoutSignal.reason);
  };

  const onUpstreamAbort = () => {
    abortController.abort(upstreamSignal?.reason);
  };

  if (timeoutSignal.aborted) {
    onTimeoutAbort();
  } else {
    timeoutSignal.addEventListener("abort", onTimeoutAbort, { once: true });
  }

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      onUpstreamAbort();
    } else {
      upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: abortController.signal,
    });
  } catch (cause) {
    if (didTimeout) {
      throw new Error(`Atlassian request timed out after ${JIRA_API_TIMEOUT_MS}ms`, {
        cause,
      });
    }
    throw cause;
  } finally {
    timeoutSignal.removeEventListener("abort", onTimeoutAbort);
    if (upstreamSignal) {
      upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    }
  }
}

export class JiraApiClient {
  private readonly auth: JiraApiAuth;
  private cachedCloudId?: string;

  constructor(auth: JiraApiAuth) {
    this.auth = auth;
  }

  get authKind(): JiraApiAuth["kind"] {
    return this.auth.kind;
  }

  private get baseUrl(): string {
    if (this.auth.kind === "oauth") {
      return jiraCloudApiBaseUrl(this.auth.cloudId);
    }
    const trimmed = this.auth.siteUrl.trim();
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }

  private get authHeader(): string {
    if (this.auth.kind === "oauth") {
      return `Bearer ${this.auth.accessToken}`;
    }
    const encoded = btoa(`${this.auth.email}:${this.auth.apiToken}`);
    return `Basic ${encoded}`;
  }

  private resolveUrl(pathOrUrl: string): { url: string; path: string } {
    const base = new URL(`${this.baseUrl}/`);
    const resolved =
      this.auth.kind === "oauth" && pathOrUrl.startsWith("/") && !pathOrUrl.startsWith("//")
        ? new URL(pathOrUrl.replace(/^\/+/, ""), base)
        : new URL(pathOrUrl, base);
    if (resolved.origin !== base.origin) {
      throw new AtlassianApiError({
        status: 400,
        message: "Refusing to fetch Atlassian asset outside the authenticated origin.",
        path: pathOrUrl,
      });
    }
    return {
      url: resolved.toString(),
      path: `${resolved.pathname}${resolved.search}`,
    };
  }

  private async fetchResponse(
    pathOrUrl: string,
    init?: RequestInit,
    options?: {
      accept?: string;
      contentType?: string;
    },
  ): Promise<{ response: Response; path: string }> {
    const { url, path } = this.resolveUrl(pathOrUrl);
    let response: Response;
    try {
      response = await fetchWithJiraTimeout(url, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          // Detail refreshes must observe a Jira edit immediately. This also protects reads from
          // transparent proxy caches between the app server and Jira/GHE.
          "Cache-Control": "no-cache",
          ...(options?.accept ? { Accept: options.accept } : {}),
          ...(options?.contentType ? { "Content-Type": options.contentType } : {}),
          ...init?.headers,
        },
      });
    } catch (cause) {
      throw new AtlassianNetworkError({ cause, path });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AtlassianAuthError({
        message: `Authentication failed (${response.status}). Check your credentials or re-authenticate.`,
        path,
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new AtlassianApiError({
        status: response.status,
        message: text,
        path,
      });
    }

    return { response, path };
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const { response, path: resolvedPath } = await this.fetchResponse(path, init, {
      accept: "application/json",
      contentType: "application/json",
    });

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new AtlassianApiError({
        status: response.status,
        message: `Invalid JSON response: ${cause instanceof Error ? cause.message : String(cause)}`,
        path: resolvedPath,
      });
    }
  }

  private buildIssueFields(extraFields: ReadonlyArray<string> = []): string {
    const baseFields = [
      "key",
      "summary",
      "parent",
      "subtasks",
      "issuelinks",
      "issuetype",
      "status",
      "priority",
      "assignee",
      "reporter",
      "labels",
      "description",
      "updated",
      "created",
      "comment",
      "project",
      "attachment",
      "duedate",
      "resolution",
      "resolutiondate",
      "timetracking",
      "worklog",
      "watches",
      "votes",
      "components",
      "fixVersions",
      "versions",
      "environment",
      "security",
    ];

    const merged = [...new Set([...baseFields, ...extraFields])];
    return merged.join(",");
  }

  async getCloudId(): Promise<string> {
    if (this.auth.kind === "oauth") {
      return this.auth.cloudId;
    }
    if (this.cachedCloudId) {
      return this.cachedCloudId;
    }
    const tenantInfo = await this.fetchJson<{ cloudId: string }>(
      `${this.baseUrl}/_edge/tenant_info`,
    );
    if (typeof tenantInfo.cloudId !== "string" || tenantInfo.cloudId.trim().length === 0) {
      throw new AtlassianApiError({
        status: 502,
        message: "Atlassian tenant_info response did not include a cloudId.",
        path: "/_edge/tenant_info",
      });
    }
    this.cachedCloudId = tenantInfo.cloudId;
    return this.cachedCloudId;
  }

  get supportsGraphql(): boolean {
    return this.auth.kind !== "oauth";
  }

  async postGraphql<T>(body: { query: string; variables?: Record<string, unknown> }): Promise<T> {
    if (this.auth.kind === "oauth") {
      throw new AtlassianApiError({
        status: 400,
        message:
          "GraphQL gateway is not reachable for OAuth-authenticated Jira clients (no site-domain base URL).",
        path: "/gateway/api/graphql",
      });
    }
    return this.fetchJson<T>(`${this.baseUrl}/gateway/api/graphql`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async downloadAsset(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
    const { response } = await this.fetchResponse(url, undefined, {
      accept: "*/*",
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
    return {
      bytes,
      ...(mimeType ? { mimeType } : {}),
    };
  }

  async getMyself(): Promise<JiraMyself> {
    return this.fetchJson<JiraMyself>("/rest/api/3/myself");
  }

  async searchProjects(): Promise<JiraProjectSearchResponse> {
    return this.fetchJson<JiraProjectSearchResponse>(
      "/rest/api/3/project/search?maxResults=100&orderBy=name",
    );
  }

  async getProject(projectIdOrKey: string): Promise<JiraProject> {
    const encoded = encodeURIComponent(projectIdOrKey);
    return this.fetchJson<JiraProject>(`/rest/api/3/project/${encoded}`);
  }

  async getProjectStatuses(
    projectIdOrKey: string,
  ): Promise<ReadonlyArray<JiraProjectIssueTypeStatuses>> {
    const encoded = encodeURIComponent(projectIdOrKey);
    return this.fetchJson<ReadonlyArray<JiraProjectIssueTypeStatuses>>(
      `/rest/api/3/project/${encoded}/statuses`,
    );
  }

  async listBoards(projectKeyOrId: string): Promise<JiraBoardSearchResponse> {
    const params = new URLSearchParams({
      projectKeyOrId,
      maxResults: "100",
    });
    return this.fetchJson<JiraBoardSearchResponse>(`/rest/agile/1.0/board?${params.toString()}`);
  }

  async getBoard(boardId: string): Promise<JiraBoard> {
    return this.fetchJson<JiraBoard>(`/rest/agile/1.0/board/${encodeURIComponent(boardId)}`);
  }

  async getBoardConfiguration(boardId: string): Promise<JiraBoardConfigurationResponse> {
    return this.fetchJson<JiraBoardConfigurationResponse>(
      `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/configuration`,
    );
  }

  async listBoardSprints(
    boardId: string,
    states: ReadonlyArray<"active" | "future" | "closed"> = ["active", "future", "closed"],
  ): Promise<JiraSprintSearchResponse> {
    const params = new URLSearchParams({
      maxResults: "100",
    });
    if (states.length > 0) {
      params.set("state", states.join(","));
    }
    return this.fetchJson<JiraSprintSearchResponse>(
      `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?${params.toString()}`,
    );
  }

  async listBoardQuickFilters(boardId: string): Promise<JiraQuickFilterSearchResponse> {
    const params = new URLSearchParams({
      maxResults: "100",
    });
    return this.fetchJson<JiraQuickFilterSearchResponse>(
      `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/quickfilter?${params.toString()}`,
    );
  }

  async listFavouriteFilters(): Promise<ReadonlyArray<JiraFilter>> {
    return this.fetchJson<ReadonlyArray<JiraFilter>>(
      "/rest/api/3/filter/favourite?expand=owner,jql",
    );
  }

  async searchFilters(maxResults = 50): Promise<JiraFilterSearchResponse> {
    const params = new URLSearchParams({
      expand: "owner,jql",
      maxResults: String(maxResults),
    });
    return this.fetchJson<JiraFilterSearchResponse>(`/rest/api/3/filter/search?${params}`);
  }

  async searchIssues(
    jql: string,
    maxResults = 50,
    extraFields: ReadonlyArray<string> = [],
    pageToken?: string,
  ): Promise<JiraIssueSearchResponse> {
    const encodedJql = encodeURIComponent(jql);
    const fields = this.buildIssueFields(extraFields);
    const params = [`jql=${encodedJql}`, `fields=${fields}`, `maxResults=${maxResults}`];
    if (pageToken) {
      params.push(`nextPageToken=${encodeURIComponent(pageToken)}`);
    }
    return this.fetchJson<JiraIssueSearchResponse>(`/rest/api/3/search/jql?${params.join("&")}`);
  }

  async getIssue(
    issueIdOrKey: string,
    extraFields: ReadonlyArray<string> = [],
    options?: { expandChangelog?: boolean },
  ): Promise<JiraIssue> {
    const fields = this.buildIssueFields(extraFields);
    const expand = options?.expandChangelog ? "renderedFields,changelog" : "renderedFields";
    return this.fetchJson<JiraIssue>(
      `/rest/api/3/issue/${issueIdOrKey}?fields=${fields}&expand=${expand}`,
    );
  }

  async getIssueEditMeta(issueIdOrKey: string): Promise<JiraIssueEditMetaResponse> {
    return this.fetchJson<JiraIssueEditMetaResponse>(`/rest/api/3/issue/${issueIdOrKey}/editmeta`);
  }

  async getIssueTransitions(issueIdOrKey: string): Promise<ReadonlyArray<JiraIssueTransition>> {
    const response = await this.fetchJson<JiraIssueTransitionsResponse>(
      `/rest/api/3/issue/${issueIdOrKey}/transitions`,
    );
    return response.transitions;
  }

  async listFields(): Promise<ReadonlyArray<JiraField>> {
    return this.fetchJson<ReadonlyArray<JiraField>>("/rest/api/3/field");
  }

  async searchAssignableUsers(issueIdOrKey: string, query = ""): Promise<ReadonlyArray<JiraUser>> {
    const params = new URLSearchParams({ issueKey: issueIdOrKey });
    if (query.trim().length > 0) {
      params.set("query", query.trim());
    }
    return this.fetchJson<ReadonlyArray<JiraUser>>(
      `/rest/api/3/user/assignable/search?${params.toString()}`,
    );
  }

  async updateIssue(issueIdOrKey: string, fields: Record<string, unknown>): Promise<void> {
    await this.fetchResponse(
      `/rest/api/3/issue/${issueIdOrKey}`,
      {
        method: "PUT",
        body: JSON.stringify({ fields }),
      },
      {
        accept: "application/json",
        contentType: "application/json",
      },
    );
  }

  async assignIssue(issueIdOrKey: string, accountId: string | null): Promise<void> {
    await this.fetchResponse(
      `/rest/api/3/issue/${issueIdOrKey}/assignee`,
      {
        method: "PUT",
        body: JSON.stringify({ accountId }),
      },
      {
        accept: "application/json",
        contentType: "application/json",
      },
    );
  }

  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<void> {
    await this.fetchResponse(
      `/rest/api/3/issue/${issueIdOrKey}/transitions`,
      {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
      {
        accept: "application/json",
        contentType: "application/json",
      },
    );
  }

  async createIssue(fields: Record<string, unknown>): Promise<JiraIssueCreateResponse> {
    return this.fetchJson<JiraIssueCreateResponse>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  /**
   * Issue types creatable in a project.
   *
   * Uses the per-project endpoint. The older
   * `createmeta?projectIds=…&expand=projects.issuetypes.fields` form this replaced was removed from
   * Jira Cloud, and its failure was invisible: the caller read `projects[].issuetypes`, got nothing,
   * and reported it as "this project has no subtask type" rather than as a broken request.
   *
   * Takes `projectIdOrKey`, so a caller holding either a numeric id or a project key works.
   */
  async getCreateMetaIssueTypes(projectIdOrKey: string): Promise<JiraCreateMetaIssueTypesResponse> {
    const encoded = encodeURIComponent(projectIdOrKey);
    return this.fetchJson<JiraCreateMetaIssueTypesResponse>(
      `/rest/api/3/issue/createmeta/${encoded}/issuetypes`,
    );
  }

  async getIssueComments(issueIdOrKey: string): Promise<JiraCommentsResponse> {
    return this.fetchJson<JiraCommentsResponse>(`/rest/api/3/issue/${issueIdOrKey}/comment`);
  }

  async addIssueComment(issueIdOrKey: string, body: unknown): Promise<unknown> {
    return this.fetchJson<unknown>(`/rest/api/3/issue/${issueIdOrKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async editIssueComment(issueIdOrKey: string, commentId: string, body: unknown): Promise<unknown> {
    return this.fetchJson<unknown>(`/rest/api/3/issue/${issueIdOrKey}/comment/${commentId}`, {
      method: "PUT",
      body: JSON.stringify({ body }),
    });
  }

  async deleteIssueComment(issueIdOrKey: string, commentId: string): Promise<void> {
    await this.fetchResponse(`/rest/api/3/issue/${issueIdOrKey}/comment/${commentId}`, {
      method: "DELETE",
    });
  }

  async createIssueLink(input: {
    readonly type: { readonly name: string };
    readonly inwardIssue: { readonly key: string };
    readonly outwardIssue: { readonly key: string };
  }): Promise<void> {
    await this.fetchResponse(
      "/rest/api/3/issueLink",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      {
        accept: "application/json",
        contentType: "application/json",
      },
    );
  }

  async deleteIssueLink(linkId: string): Promise<void> {
    await this.fetchResponse(`/rest/api/3/issueLink/${linkId}`, {
      method: "DELETE",
    });
  }

  async getIssueLinkTypes(): Promise<JiraIssueLinkTypesResponse> {
    return this.fetchJson<JiraIssueLinkTypesResponse>("/rest/api/3/issueLinkType");
  }
}

export class AtlassianOAuthApiClient {
  readonly config: AtlassianOAuthConfig;
  readonly token: TokenExchangeResult;

  constructor(config: AtlassianOAuthConfig, token: TokenExchangeResult) {
    this.config = config;
    this.token = token;
  }

  listAccessibleResources() {
    return listAccessibleResources(this.token.accessToken);
  }

  forCloud(cloudId: string): JiraApiClient {
    return new JiraApiClient({
      kind: "oauth",
      cloudId,
      accessToken: this.token.accessToken,
    });
  }
}
