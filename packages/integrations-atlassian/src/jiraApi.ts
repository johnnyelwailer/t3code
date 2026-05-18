import type {
  AtlassianAccessibleResource,
  AtlassianOAuthConfig,
  TokenExchangeResult,
} from "./oauth.ts";
import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  type JiraCommentsResponse,
  type JiraIssue,
  type JiraIssueSearchResponse,
  type JiraMyself,
  type JiraProjectSearchResponse,
} from "./client.ts";

export type JiraApiAuth =
  | {
      readonly kind: "oauth";
      readonly cloudId: string;
      readonly accessToken: string;
    }
  | {
      readonly kind: "basic";
      readonly siteUrl: string;
      readonly email: string;
      readonly apiToken: string;
    };

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
      return `https://api.atlassian.com/ex/jira/${this.auth.cloudId}`;
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

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
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

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new AtlassianApiError({
        status: response.status,
        message: `Invalid JSON response: ${cause instanceof Error ? cause.message : String(cause)}`,
        path,
      });
    }
  }

  async getMyself(): Promise<JiraMyself> {
    return this.fetchJson<JiraMyself>("/rest/api/3/myself");
  }

  async searchProjects(): Promise<JiraProjectSearchResponse> {
    return this.fetchJson<JiraProjectSearchResponse>(
      "/rest/api/3/project/search?maxResults=100&orderBy=name",
    );
  }

  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssueSearchResponse> {
    const encodedJql = encodeURIComponent(jql);
    const fields = [
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
    ].join(",");
    return this.fetchJson<JiraIssueSearchResponse>(
      `/rest/api/3/search/jql?jql=${encodedJql}&fields=${fields}&maxResults=${maxResults}`,
    );
  }

  async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
    const fields = [
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
      "attachment",
      "updated",
      "created",
      "comment",
      "project",
    ].join(",");
    return this.fetchJson<JiraIssue>(
      `/rest/api/3/issue/${issueIdOrKey}?fields=${fields}&expand=renderedFields`,
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

  async listAccessibleResources(): Promise<ReadonlyArray<AtlassianAccessibleResource>> {
    const response = await fetch("https://auth.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Authorization: `Bearer ${this.token.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new AtlassianApiError({
        status: response.status,
        message: text,
        path: "/oauth/token/accessible-resources",
      });
    }

    return (await response.json()) as ReadonlyArray<AtlassianAccessibleResource>;
  }

  forCloud(cloudId: string): JiraApiClient {
    return new JiraApiClient({
      kind: "oauth",
      cloudId,
      accessToken: this.token.accessToken,
    });
  }
}
