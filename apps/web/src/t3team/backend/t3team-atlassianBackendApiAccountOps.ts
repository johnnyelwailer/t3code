import {
  usableAccounts,
  type AtlassianAccountBackendApi,
  type AtlassianAccountStatus,
} from "./t3team-atlassianAccountStatus";

type PostJson = <TRequest extends object, TResponse>(
  path: string,
  body: TRequest,
) => Promise<TResponse>;

export function createAtlassianAccountOpsApi(post: PostJson): AtlassianAccountBackendApi {
  const listAccountStatuses = async () =>
    (
      await post<object, { accounts: ReadonlyArray<AtlassianAccountStatus> }>(
        "/api/t3team/atlassian/accounts",
        {},
      )
    ).accounts;
  return {
    listAccountStatuses,
    listAccounts: async () => usableAccounts(await listAccountStatuses()),
    async disconnectAccount(accountId) {
      await post<{ accountId: string }, { disconnected: boolean }>(
        "/api/t3team/atlassian/disconnect",
        { accountId },
      );
    },
  };
}
