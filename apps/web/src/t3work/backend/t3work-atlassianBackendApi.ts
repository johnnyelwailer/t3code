import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

import { createAtlassianIssueOpsApi } from "./t3work-atlassianBackendApiIssueOps";
import type {
  AtlassianBackendApi,
  AtlassianBacklogResponse,
  AtlassianBacklogSearchInput,
  AtlassianBacklogSearchResult,
  AtlassianBasicConnectInput,
  AtlassianBoardColumnsResponse,
  AtlassianOAuthConnectInput,
  AtlassianOAuthExchangeInput,
  AtlassianOAuthExchangeResult,
  TempoCapacityResponse,
} from "./t3work-atlassianBackendTypes";
import { postJson } from "./t3work-t3BackendHttp";

export function createAtlassianBackendApi(httpBaseUrl: string): AtlassianBackendApi {
  const post = <TRequest extends object, TResponse>(path: string, body: TRequest) =>
    postJson<TRequest, TResponse>(httpBaseUrl, path, body);

  return {
    async getTempoCapacity(input: {
      readonly accountIds: ReadonlyArray<string>;
      readonly from: string;
      readonly to: string;
      readonly projectKey?: string;
      readonly atlassianAccountId?: string;
    }): Promise<TempoCapacityResponse> {
      return post<typeof input, TempoCapacityResponse>("/api/t3work/tempo/capacity", input);
    },

    async setTempoToken(token: string | null): Promise<{ configured: boolean }> {
      return post<{ token: string | null }, { configured: boolean }>("/api/t3work/tempo/token", {
        token,
      });
    },

    async listAccounts(): Promise<ReadonlyArray<IntegrationAccount>> {
      const response = await post<object, { accounts: ReadonlyArray<IntegrationAccount> }>(
        "/api/t3work/atlassian/accounts",
        {},
      );
      return response.accounts;
    },

    async connectBasic(
      input: AtlassianBasicConnectInput,
    ): Promise<ReadonlyArray<IntegrationAccount>> {
      const response = await post<
        { auth: { kind: "basic"; siteUrl: string; email: string; apiToken: string } },
        { accounts: ReadonlyArray<IntegrationAccount> }
      >("/api/t3work/atlassian/connect/basic", {
        auth: {
          kind: "basic",
          siteUrl: input.siteUrl,
          email: input.email,
          apiToken: input.apiToken,
        },
      });
      return response.accounts;
    },

    async connectOAuth(
      input: AtlassianOAuthConnectInput,
    ): Promise<ReadonlyArray<IntegrationAccount>> {
      const response = await post<
        {
          auth: {
            kind: "oauth";
            sites: AtlassianOAuthConnectInput["sites"];
            token: AtlassianOAuthConnectInput["token"];
          };
        },
        { accounts: ReadonlyArray<IntegrationAccount> }
      >("/api/t3work/atlassian/connect/oauth", {
        auth: {
          kind: "oauth",
          sites: input.sites,
          token: input.token,
        },
      });
      return response.accounts;
    },

    exchangeOAuthCode(input: AtlassianOAuthExchangeInput): Promise<AtlassianOAuthExchangeResult> {
      return post<AtlassianOAuthExchangeInput, AtlassianOAuthExchangeResult>(
        "/api/t3work/atlassian/oauth/exchange",
        input,
      );
    },

    async listProjects(account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
      const response = await post<
        IntegrationAccountRef,
        { projects: ReadonlyArray<ExternalProject> }
      >("/api/t3work/atlassian/projects", account);
      return response.projects;
    },

    async listResources(input: {
      readonly account: IntegrationAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
    }): Promise<ResourcePage> {
      const response = await post<typeof input, { page: ResourcePage }>(
        "/api/t3work/atlassian/resources",
        input,
      );
      return response.page;
    },

    async listBacklog(input: {
      readonly account: IntegrationAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly boardId?: string;
      readonly sprintId?: string;
      readonly filterId?: string;
      readonly forceRefresh?: boolean;
      readonly clearProjectCache?: boolean;
    }) {
      return post<typeof input, AtlassianBacklogResponse>("/api/t3work/atlassian/backlog", input);
    },

    async searchBacklog(input: AtlassianBacklogSearchInput) {
      return post<typeof input, AtlassianBacklogSearchResult>(
        "/api/t3work/atlassian/backlog/search",
        input,
      );
    },

    async getBoardColumns(input: {
      readonly account: IntegrationAccountRef;
      readonly externalProjectId: string;
      readonly boardId?: string;
    }) {
      return post<typeof input, AtlassianBoardColumnsResponse>(
        "/api/t3work/atlassian/board-columns",
        input,
      );
    },

    async getResource(input: {
      readonly accountId: string;
      readonly ref: unknown;
    }): Promise<ResourceSnapshot> {
      const response = await post<typeof input, { snapshot: ResourceSnapshot }>(
        "/api/t3work/atlassian/resource",
        input,
      );
      return response.snapshot;
    },

    ...createAtlassianIssueOpsApi(post),
  };
}
