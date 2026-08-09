import type { ResourcePage } from "@t3tools/project-context";

import type {
  AtlassianAssignableUser,
  AtlassianBackendApi,
  AtlassianChildIssueType,
  AtlassianDownloadedAsset,
} from "./t3team-atlassianBackendTypes";

type PostJson = <TRequest extends object, TResponse>(
  path: string,
  body: TRequest,
) => Promise<TResponse>;

type AtlassianIssueOpsApi = Pick<
  AtlassianBackendApi,
  | "searchAssignableUsers"
  | "updateIssueAssignee"
  | "updateIssueEstimate"
  | "updateIssueStatus"
  | "updateIssueDescription"
  | "createSubtask"
  | "listChildIssueTypes"
  | "downloadAsset"
>;

export function createAtlassianIssueOpsApi(post: PostJson): AtlassianIssueOpsApi {
  return {
    async searchAssignableUsers(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly query?: string;
    }): Promise<ReadonlyArray<AtlassianAssignableUser>> {
      const response = await post<typeof input, { users: ReadonlyArray<AtlassianAssignableUser> }>(
        "/api/t3team/atlassian/backlog/assignable-users",
        input,
      );
      return response.users;
    },

    async updateIssueAssignee(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly assigneeAccountId?: string | null;
      readonly assigneeDisplayName?: string | null;
    }): Promise<void> {
      await post<typeof input, { ok: true }>(
        "/api/t3team/atlassian/backlog/update-assignee",
        input,
      );
    },

    async updateIssueEstimate(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly estimateValue: number | null;
      readonly estimateMode?: "points" | "hours";
    }): Promise<{ label: string }> {
      const response = await post<typeof input, { ok: true; label: string }>(
        "/api/t3team/atlassian/backlog/update-estimate",
        input,
      );
      return { label: response.label };
    },

    async updateIssueStatus(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly targetStatus: string;
    }): Promise<{ status: string }> {
      const response = await post<typeof input, { ok: true; status: string }>(
        "/api/t3team/atlassian/issue/update-status",
        input,
      );
      return { status: response.status };
    },

    async updateIssueDescription(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly description: string;
    }): Promise<void> {
      // Markdown as authored; the server owns the conversion.
      await post<typeof input, { ok: true }>(
        "/api/t3team/atlassian/issue/update-description",
        input,
      );
    },

    async createSubtask(input: {
      readonly accountId: string;
      readonly projectId: string;
      readonly parentIssueIdOrKey: string;
      readonly summary: string;
      readonly description?: string;
      readonly estimateHours?: number;
      readonly issueTypeId?: string;
      readonly assigneeAccountId?: string | null;
    }): Promise<{ id: string; key: string; item?: ResourcePage["items"][number] }> {
      const response = await post<
        typeof input,
        { created: { id: string; key: string; item?: ResourcePage["items"][number] } }
      >("/api/t3team/atlassian/backlog/create-subtask", input);
      return response.created;
    },

    async listChildIssueTypes(input: {
      readonly accountId: string;
      readonly projectId: string;
    }): Promise<ReadonlyArray<AtlassianChildIssueType>> {
      const response = await post<
        typeof input,
        { issueTypes: ReadonlyArray<AtlassianChildIssueType> }
      >("/api/t3team/atlassian/backlog/child-issue-types", input);
      return response.issueTypes;
    },

    async downloadAsset(input: {
      readonly accountId: string;
      readonly url: string;
    }): Promise<AtlassianDownloadedAsset> {
      const response = await post<typeof input, { asset: AtlassianDownloadedAsset }>(
        "/api/t3team/atlassian/asset",
        input,
      );
      return response.asset;
    },
  };
}
