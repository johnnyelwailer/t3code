import type {
  DiscoverProjectRecipesRequest,
  DiscoverProjectRecipesResponse,
} from "@t3tools/project-recipes";
import type {
  GitHubBackendApi,
  GitHubInboxDiscoverResponse,
  ProjectWorkspaceContextFile,
  ProjectWorkspaceBackendApi,
  ProjectWorkspaceBootstrapResult,
  ProjectWorkspaceRefreshWorkItemContextResult,
  ProjectWorkspaceRefreshWorkItemSliceContextResult,
  ProjectWorkspaceWriteContextFilesResult,
} from "./t3work-types";
import type { GitHubAssetDownloadRequest, GitHubDownloadedAsset } from "./t3work-githubAssetTypes";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "./t3work-githubTypes";
import { postJson } from "./t3work-t3BackendHttp";

export { createAtlassianBackendApi } from "./t3work-atlassianBackendApi";

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
    discoverRecipes(input: DiscoverProjectRecipesRequest): Promise<DiscoverProjectRecipesResponse> {
      return postJson<DiscoverProjectRecipesRequest, DiscoverProjectRecipesResponse>(
        httpBaseUrl,
        "/api/t3work/project/workspace/recipes/discover",
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
    refreshWorkItemContext(input: {
      readonly workspaceRoot: string;
      readonly projectId: string;
      readonly ticketKey: string;
      readonly force?: boolean;
    }): Promise<ProjectWorkspaceRefreshWorkItemContextResult> {
      return postJson<typeof input, ProjectWorkspaceRefreshWorkItemContextResult>(
        httpBaseUrl,
        "/api/t3work/project/workspace/context-refresh/work-item",
        input,
      );
    },
    refreshWorkItemSliceContext(input: {
      readonly workspaceRoot: string;
      readonly projectId: string;
      readonly ticketKey: string;
      readonly focusKind: string;
      readonly focusLabel: string;
      readonly summaryItems: ReadonlyArray<{ readonly label: string; readonly value: string }>;
      readonly force?: boolean;
    }): Promise<ProjectWorkspaceRefreshWorkItemSliceContextResult> {
      return postJson<typeof input, ProjectWorkspaceRefreshWorkItemSliceContextResult>(
        httpBaseUrl,
        "/api/t3work/project/workspace/context-refresh/work-item-slice",
        input,
      );
    },
  };
}
