import type { ResourcePage } from "@t3tools/project-context";

import type { BackendApi } from "./t3team-types";
import { postJson } from "./t3team-t3BackendHttp";

type ProjectIssuesAccountRef = { readonly id: string; readonly provider: string };

export type T3TeamProjectIssuesInput = {
  readonly account: ProjectIssuesAccountRef;
  readonly externalProjectId: string;
};

/**
 * `live-fallback` marks a provisional response served while the server's
 * project mirror is still empty (typically the first minute after a server
 * boot). It only contains the viewer's own issues, so callers should re-ask
 * shortly instead of treating it as the project.
 */
export type T3TeamProjectIssuesCapabilities = {
  readonly canCreateSubtasks: boolean;
  /** Absent when nothing has resolved the project's estimate field yet — never guessed. */
  readonly estimateFieldLabel?: string;
};

export type T3TeamProjectIssuesResult = {
  readonly page: ResourcePage;
  readonly source: "mirror" | "live-fallback";
  readonly capabilities?: T3TeamProjectIssuesCapabilities;
};

export type T3TeamProjectIssuesBackend = BackendApi & {
  readonly atlassian: BackendApi["atlassian"] & {
    readonly listProjectIssues: (
      input: T3TeamProjectIssuesInput,
    ) => Promise<T3TeamProjectIssuesResult>;
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
    async listProjectIssues(input: T3TeamProjectIssuesInput): Promise<T3TeamProjectIssuesResult> {
      return postJson<T3TeamProjectIssuesInput, T3TeamProjectIssuesResult>(
        httpBaseUrl,
        "/api/t3team/atlassian/project-issues",
        input,
      );
    },
  };
}

export function asT3TeamProjectIssuesBackend(
  backend: BackendApi | null,
): T3TeamProjectIssuesBackend | null {
  return backend as T3TeamProjectIssuesBackend | null;
}
