import type { AtlassianBackendApi, AtlassianIssueLinkType } from "./t3team-atlassianBackendTypes";

type PostJson = <TRequest extends object, TResponse>(
  path: string,
  body: TRequest,
) => Promise<TResponse>;

type AtlassianIssueContentOpsApi = Pick<
  AtlassianBackendApi,
  | "addIssueComment"
  | "updateIssueComment"
  | "deleteIssueComment"
  | "createIssueLink"
  | "deleteIssueLink"
  | "listIssueLinkTypes"
>;

/** Comment and issue-link write ops, kept out of `t3team-atlassianBackendApiIssueOps.ts` so
 * neither file grows past the additive-guard line cap. */
export function createAtlassianIssueContentOpsApi(post: PostJson): AtlassianIssueContentOpsApi {
  return {
    async addIssueComment(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly body: string;
    }): Promise<{ id: string }> {
      const response = await post<typeof input, { ok: true; created: { id: string } }>(
        "/api/t3team/atlassian/issue/comment/create",
        input,
      );
      return response.created;
    },

    async updateIssueComment(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly commentId: string;
      readonly body: string;
    }): Promise<void> {
      await post<typeof input, { ok: true }>("/api/t3team/atlassian/issue/comment/update", input);
    },

    async deleteIssueComment(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly commentId: string;
    }): Promise<void> {
      await post<typeof input, { ok: true }>("/api/t3team/atlassian/issue/comment/delete", input);
    },

    async createIssueLink(input: {
      readonly accountId: string;
      readonly issueIdOrKey: string;
      readonly otherIssueIdOrKey: string;
      readonly linkTypeName: string;
      readonly direction: "inward" | "outward";
    }): Promise<void> {
      await post<typeof input, { ok: true }>("/api/t3team/atlassian/issue/link/create", input);
    },

    async deleteIssueLink(input: {
      readonly accountId: string;
      readonly linkId: string;
    }): Promise<void> {
      await post<typeof input, { ok: true }>("/api/t3team/atlassian/issue/link/delete", input);
    },

    async listIssueLinkTypes(input: {
      readonly accountId: string;
    }): Promise<ReadonlyArray<AtlassianIssueLinkType>> {
      const response = await post<
        typeof input,
        { linkTypes: ReadonlyArray<AtlassianIssueLinkType> }
      >("/api/t3team/atlassian/issue/link-types", input);
      return response.linkTypes;
    },
  };
}
