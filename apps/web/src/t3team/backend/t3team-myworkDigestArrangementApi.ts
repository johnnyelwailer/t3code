import type { MyWorkDigestProjectInput, MyWorkDigestScope } from "./t3team-myworkDigestBackendApi";
import { postJson } from "./t3team-t3BackendHttp";

/**
 * The stored digest arrangement's one client write: back to the default. Setting one is an agent's
 * job (the `t3team.mywork.arrange` tool, run by the arrange-my-work recipe); the graph poll reads
 * it back.
 */
export function createMyWorkDigestArrangementApi(httpBaseUrl: string) {
  return {
    resetMyWorkDigestArrangement(input: {
      readonly scope: MyWorkDigestScope;
      readonly projects: ReadonlyArray<MyWorkDigestProjectInput>;
    }): Promise<{ readonly ok: true }> {
      return postJson(httpBaseUrl, "/api/t3team/mywork-digest/arrangement/reset", input);
    },
  };
}

export type MyWorkDigestArrangementApi = ReturnType<typeof createMyWorkDigestArrangementApi>;

export function readMyWorkDigestArrangementApi(
  backend: unknown,
): MyWorkDigestArrangementApi | undefined {
  const atlassian = (backend as { readonly atlassian?: Partial<MyWorkDigestArrangementApi> } | null)
    ?.atlassian;
  return typeof atlassian?.resetMyWorkDigestArrangement === "function"
    ? (atlassian as MyWorkDigestArrangementApi)
    : undefined;
}
