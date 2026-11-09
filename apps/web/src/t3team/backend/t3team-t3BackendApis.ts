import type {
  DiscoverProjectRecipesRequest,
  DiscoverProjectRecipesResponse,
} from "@t3tools/project-recipes";
import type {
  GitHubBackendApi,
  GitHubInboxDiscoverResponse,
  LinkedRepositoryBranches,
  LinkedRepositorySyncResult,
  ProjectMainRepositorySwitchResult,
  ProjectWorkspaceContextFile,
  ProjectWorkspaceBackendApi,
  ProjectWorkspaceBootstrapResult,
  ProjectWorkspaceRefreshWorkItemContextResult,
  ProjectWorkspaceRefreshWorkItemSliceContextResult,
  ProjectWorkspaceWriteContextFilesResult,
} from "./t3team-types";
import type { GitHubAssetDownloadRequest, GitHubDownloadedAsset } from "./t3team-githubAssetTypes";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "./t3team-githubTypes";
import { postJson } from "./t3team-t3BackendHttp";

/** `POST /api/t3team/project/main-repository` migrates the state dir before it answers. */
export const MAIN_REPOSITORY_SWITCH_TIMEOUT_MS = 180_000;
export { createAtlassianBackendApi } from "./t3team-atlassianBackendApi";

export function createGitHubBackendApi(httpBaseUrl: string): GitHubBackendApi {
  return {
    discoverInbox(input: {
      readonly host: string;
      readonly projectKey?: string;
      readonly projectTitle?: string;
      readonly linkedRepositoryUrls?: ReadonlyArray<string>;
      readonly discoveryMode?: "inbox" | "repositories";
      readonly trigger?: "user" | "background";
      readonly refresh?: boolean;
    }) {
      return postJson<typeof input, GitHubInboxDiscoverResponse>(
        httpBaseUrl,
        "/api/t3team/github/inbox",
        input,
      );
    },
    getPullRequestContext(input: GitHubPullRequestContextRequest) {
      return postJson<GitHubPullRequestContextRequest, GitHubPullRequestContextResponse>(
        httpBaseUrl,
        "/api/t3team/github/pull-request-context",
        input,
      );
    },
    downloadAsset(input: GitHubAssetDownloadRequest) {
      return postJson<GitHubAssetDownloadRequest, { asset: GitHubDownloadedAsset }>(
        httpBaseUrl,
        "/api/t3team/github/asset",
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
      readonly syncLinkedRepositoryUrls?: ReadonlyArray<string>;
      readonly inspectLinkedRepositoriesForMainRepository?: boolean;
    }): Promise<ProjectWorkspaceBootstrapResult> {
      return postJson<typeof input, ProjectWorkspaceBootstrapResult>(
        httpBaseUrl,
        "/api/t3team/project/workspace/bootstrap",
        input,
      );
    },
    readLinkedRepositoryStatus(input) {
      return postJson<typeof input, { linkedRepositories: LinkedRepositorySyncResult[] }>(
        httpBaseUrl,
        "/api/t3team/project/workspace/linked-repositories/status",
        input,
      );
    },
    syncLinkedRepository(input) {
      return postJson<typeof input, { linkedRepository: LinkedRepositorySyncResult }>(
        httpBaseUrl,
        "/api/t3team/project/workspace/linked-repositories/sync",
        input,
      );
    },
    listLinkedRepositoryBranches(input) {
      return postJson<typeof input, LinkedRepositoryBranches>(
        httpBaseUrl,
        "/api/t3team/project/workspace/linked-repositories/branches",
        input,
      );
    },
    setMainRepository(input) {
      return postJson<typeof input, ProjectMainRepositorySwitchResult>(
        httpBaseUrl,
        "/api/t3team/project/main-repository",
        input,
        // The switch copies the project state dir into the new checkout; a large one takes well
        // over the default 15s, and aborting at 15s left the switch unrecorded.
        { timeoutMs: MAIN_REPOSITORY_SWITCH_TIMEOUT_MS },
      );
    },
    discoverRecipes(input: DiscoverProjectRecipesRequest): Promise<DiscoverProjectRecipesResponse> {
      return postJson<DiscoverProjectRecipesRequest, DiscoverProjectRecipesResponse>(
        httpBaseUrl,
        "/api/t3team/project/workspace/recipes/discover",
        input,
      );
    },
    writeContextFiles(input: {
      readonly workspaceRoot: string;
      readonly files: ReadonlyArray<ProjectWorkspaceContextFile>;
    }): Promise<ProjectWorkspaceWriteContextFilesResult> {
      return postJson<typeof input, ProjectWorkspaceWriteContextFilesResult>(
        httpBaseUrl,
        "/api/t3team/project/workspace/context-files",
        input,
      );
    },
    readWorkItemRecord(input: {
      readonly projectId: string;
      readonly issueKey: string;
    }): Promise<unknown> {
      return postJson<typeof input, unknown>(httpBaseUrl, "/api/t3team/work-item/record", input);
    },
    refreshWorkItemContext(input: {
      readonly workspaceRoot: string;
      readonly projectId: string;
      readonly ticketKey: string;
      readonly force?: boolean;
    }): Promise<ProjectWorkspaceRefreshWorkItemContextResult> {
      return postJson<typeof input, ProjectWorkspaceRefreshWorkItemContextResult>(
        httpBaseUrl,
        "/api/t3team/project/workspace/context-refresh/work-item",
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
        "/api/t3team/project/workspace/context-refresh/work-item-slice",
        input,
      );
    },
  };
}
