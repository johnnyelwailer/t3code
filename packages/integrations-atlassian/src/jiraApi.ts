import type { AtlassianOAuthConfig, TokenExchangeResult } from "./oauth.ts";
import { listAccessibleResources } from "./oauth.ts";
import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  type JiraBoard,
  type JiraBoardConfigurationResponse,
  type JiraBoardSearchResponse,
  type JiraCreateMetaResponse,
  type JiraCommentsResponse,
  type JiraField,
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
    ];

    const merged = [...new Set([...baseFields, ...extraFields])];
    return merged.join(",");
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
  ): Promise<JiraIssue> {
    const fields = this.buildIssueFields(extraFields);
    return this.fetchJson<JiraIssue>(
      `/rest/api/3/issue/${issueIdOrKey}?fields=${fields}&expand=renderedFields`,
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

  async getCreateMeta(projectId: string): Promise<JiraCreateMetaResponse> {
    const encodedProjectId = encodeURIComponent(projectId);
    return this.fetchJson<JiraCreateMetaResponse>(
      `/rest/api/3/issue/createmeta?projectIds=${encodedProjectId}&expand=projects.issuetypes.fields`,
    );
  }

  async getIssueComments(issueIdOrKey: string): Promise<JiraCommentsResponse> {
    return this.fetchJson<JiraCommentsResponse>(`/rest/api/3/issue/${issueIdOrKey}/comment`);
  }

  async addIssueComment(issueIdOrKey: string, body: string): Promise<unknown> {
    return this.fetchJson<unknown>(`/rest/api/3/issue/${issueIdOrKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
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
