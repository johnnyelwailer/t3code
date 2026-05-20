import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

import type {
  AtlassianBackendApi,
  AtlassianBasicConnectInput,
  AtlassianDownloadedAsset,
  AtlassianOAuthConnectInput,
  AtlassianOAuthExchangeInput,
  AtlassianOAuthExchangeResult,
  GitHubBackendApi,
  GitHubInboxDiscoverResponse,
  ProjectWorkspaceContextFile,
  ProjectWorkspaceBackendApi,
  ProjectWorkspaceBootstrapResult,
  ProjectWorkspaceWriteContextFilesResult,
} from "./t3work-types";
import type { GitHubAssetDownloadRequest, GitHubDownloadedAsset } from "./t3work-githubAssetTypes";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "./t3work-githubTypes";
import { postJson } from "./t3work-t3BackendHttp";

export function createAtlassianBackendApi(httpBaseUrl: string): AtlassianBackendApi {
  return {
    async listAccounts(): Promise<ReadonlyArray<IntegrationAccount>> {
      const response = await postJson<object, { accounts: ReadonlyArray<IntegrationAccount> }>(
        httpBaseUrl,
        "/api/t3work/atlassian/accounts",
        {},
      );
      return response.accounts;
    },

    async connectBasic(
      input: AtlassianBasicConnectInput,
    ): Promise<ReadonlyArray<IntegrationAccount>> {
      const response = await postJson<
        { auth: { kind: "basic"; siteUrl: string; email: string; apiToken: string } },
        { accounts: ReadonlyArray<IntegrationAccount> }
      >(httpBaseUrl, "/api/t3work/atlassian/connect/basic", {
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
      const response = await postJson<
        {
          auth: {
            kind: "oauth";
            sites: AtlassianOAuthConnectInput["sites"];
            token: AtlassianOAuthConnectInput["token"];
          };
        },
        { accounts: ReadonlyArray<IntegrationAccount> }
      >(httpBaseUrl, "/api/t3work/atlassian/connect/oauth", {
        auth: {
          kind: "oauth",
          sites: input.sites,
          token: input.token,
        },
      });
      return response.accounts;
    },

    exchangeOAuthCode(input: AtlassianOAuthExchangeInput): Promise<AtlassianOAuthExchangeResult> {
      return postJson<AtlassianOAuthExchangeInput, AtlassianOAuthExchangeResult>(
        httpBaseUrl,
        "/api/t3work/atlassian/oauth/exchange",
        input,
      );
    },

    async listProjects(account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
      const response = await postJson<
        IntegrationAccountRef,
        { projects: ReadonlyArray<ExternalProject> }
      >(httpBaseUrl, "/api/t3work/atlassian/projects", account);
      return response.projects;
    },

    async listResources(input: {
      readonly account: IntegrationAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
    }): Promise<ResourcePage> {
      const response = await postJson<typeof input, { page: ResourcePage }>(
        httpBaseUrl,
        "/api/t3work/atlassian/resources",
        input,
      );
      return response.page;
    },

    async getResource(input: {
      readonly accountId: string;
      readonly ref: unknown;
    }): Promise<ResourceSnapshot> {
      const response = await postJson<typeof input, { snapshot: ResourceSnapshot }>(
        httpBaseUrl,
        "/api/t3work/atlassian/resource",
        input,
      );
      return response.snapshot;
    },

    async downloadAsset(input: {
      readonly accountId: string;
      readonly url: string;
    }): Promise<AtlassianDownloadedAsset> {
      const response = await postJson<typeof input, { asset: AtlassianDownloadedAsset }>(
        httpBaseUrl,
        "/api/t3work/atlassian/asset",
        input,
      );
      return response.asset;
    },
  };
}

export function createGitHubBackendApi(httpBaseUrl: string): GitHubBackendApi {
  return {
    discoverInbox(input: {
      readonly host: string;
      readonly projectKey?: string;
      readonly projectTitle?: string;
      readonly linkedRepositoryUrls?: ReadonlyArray<string>;
    }) {
      return postJson<typeof input, GitHubInboxDiscoverResponse>(
        httpBaseUrl,
        "/api/t3work/github/inbox",
        input,
      );
    },
    getPullRequestContext(input: GitHubPullRequestContextRequest) {
      return postJson<GitHubPullRequestContextRequest, GitHubPullRequestContextResponse>(
        httpBaseUrl,
        "/api/t3work/github/pull-request-context",
        input,
      );
    },
    downloadAsset(input: GitHubAssetDownloadRequest) {
      return postJson<GitHubAssetDownloadRequest, { asset: GitHubDownloadedAsset }>(
        httpBaseUrl,
        "/api/t3work/github/asset",
        input,
      ).then((response) => response.asset);
    },
  };
}

export function createProjectWorkspaceBackendApi(httpBaseUrl: string): ProjectWorkspaceBackendApi {
  return {
    bootstrapWorkspace(input: {
      readonly workspaceRoot: string;
      readonly linkedRepositoryUrls?: ReadonlyArray<string>;
      readonly setupProfileId?: string;
    }): Promise<ProjectWorkspaceBootstrapResult> {
      return postJson<typeof input, ProjectWorkspaceBootstrapResult>(
        httpBaseUrl,
        "/api/t3work/project/workspace/bootstrap",
        input,
      );
    },
    writeContextFiles(input: {
      readonly workspaceRoot: string;
      readonly files: ReadonlyArray<ProjectWorkspaceContextFile>;
    }): Promise<ProjectWorkspaceWriteContextFilesResult> {
      return postJson<typeof input, ProjectWorkspaceWriteContextFilesResult>(
        httpBaseUrl,
        "/api/t3work/project/workspace/context-files",
        input,
      );
    },
  };
}
