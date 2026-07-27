import type { ResourcePage } from "@t3tools/project-context";

import type { BackendApi } from "./t3team-types";
import { postJson } from "./t3team-t3BackendHttp";

type ProjectIssuesAccountRef = { readonly id: string; readonly provider: string };

export type T3TeamProjectIssuesInput = {
  readonly account: ProjectIssuesAccountRef;
  readonly externalProjectId: string;
};

export type T3TeamProjectIssuesBackend = BackendApi & {
  readonly atlassian: BackendApi["atlassian"] & {
    readonly listProjectIssues: (input: T3TeamProjectIssuesInput) => Promise<ResourcePage>;
  };
};

/**
 * Every issue of a project, read from the server's whole-project mirror.
 *
 * Split out of `t3team-atlassianBackendApi` rather than added to it: this is
 * the client half of a mirror-backed projection (doc 33), and keeping it its
 * own module lets the mock backend and the real backend share one contract
 * without either file growing.
 */
export function createAtlassianProjectIssuesBackendApi(httpBaseUrl: string) {
  return {
    async listProjectIssues(input: T3TeamProjectIssuesInput): Promise<ResourcePage> {
      const response = await postJson<T3TeamProjectIssuesInput, { page: ResourcePage }>(
        httpBaseUrl,
        "/api/t3team/atlassian/project-issues",
        input,
      );
      return response.page;
    },
  };
}

export function asT3TeamProjectIssuesBackend(
  backend: BackendApi | null,
): T3TeamProjectIssuesBackend | null {
  return backend as T3TeamProjectIssuesBackend | null;
}
