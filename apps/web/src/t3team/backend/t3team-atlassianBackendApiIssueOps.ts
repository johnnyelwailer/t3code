import type { ResourcePage } from "@t3tools/project-context";

import type {
  AtlassianAssignableUser,
  AtlassianBackendApi,
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
  | "createSubtask"
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

    async createSubtask(input: {
      readonly accountId: string;
      readonly projectId: string;
      readonly parentIssueIdOrKey: string;
      readonly summary: string;
      readonly description?: string;
      readonly estimateHours?: number;
    }): Promise<{ id: string; key: string; item?: ResourcePage["items"][number] }> {
      const response = await post<
        typeof input,
        { created: { id: string; key: string; item?: ResourcePage["items"][number] } }
      >("/api/t3team/atlassian/backlog/create-subtask", input);
      return response.created;
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
